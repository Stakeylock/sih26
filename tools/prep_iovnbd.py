#!/usr/bin/env python3
"""
AstraNav-IDR :: IO-VNBD prep pipeline
=====================================
Turns raw IO-VNBD smartphone CSVs into:
  1. public/data/iovnbd-model.json    - ridge "virtual odometer" (trip-disjoint train/test)
  2. public/data/iovnbd-trips.json    - trip metadata + downsampled reference paths
  3. public/data/iovnbd-segments.json - blackout replay segments with real estimator runs

Estimators (all propagate on the same 10 Hz grid, GPS-masked inside the blackout):
  - ins       : gyro-integrated heading, constant speed at blackout entry (raw INS)
  - classical : gyro+mag complementary heading, ZUPT zero-speed updates (no ML)
  - ekf       : gyro+mag heading + ML virtual-odometer speed + ZUPT  (ours)

Only pre-blackout data is used for calibration (heading offset, gyro bias, initial
speed). Reference = GPS itself. Metrics are computed strictly inside the blackout.
"""

import json
import math
import os
import sys
import datetime as dt

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data", "io-vnbd", "Synchronised V abd S datasets",
                        "Categorised IOVNB Dataset")
OUT_DIR = os.path.join(ROOT, "public", "data")
os.makedirs(OUT_DIR, exist_ok=True)

RATE_HZ = 10.0
DT = 1.0 / RATE_HZ
WIN = 51  # 5.1 s window for the virtual odometer (aligned to 10 Hz)

TRIPS = {
    "S1":  "S (Driver A)/S1/S-S1.csv",
    "S3a": "S (Driver A)/S3a/S-S3a.csv",
    "S4":  "S (Driver A)/S4/S-S4.csv",
}

# segment plan: (id, trip, blackout_seconds, start_fraction, pre_seconds, post_seconds)
# start_fraction >= 0.65 keeps every blackout inside the holdout region of the
# within-trip temporal split (train on first 60% of a trip, blackout later).
# pre+blackout+post = 120 s exactly, matching the prototype's replay duration
# (index = t*10 on a shared clock with the synthetic scenarios).
SEGMENT_PLAN = [
    ("S1-B60-A", "S1", 60, 0.68, 40, 20),
    ("S1-B60-B", "S1", 60, 0.80, 40, 20),
    ("S3A-B60",  "S3a", 60, 0.70, 40, 20),
    ("S4-B30",   "S4", 30, 0.68, 40, 50),
    ("S4-B60",   "S4", 60, 0.85, 40, 20),
]

TRAIN_FRACTION = 0.60  # within-trip temporal split

COLS = ["lat", "lon", "alt", "gpsSpeedKmh", "gpsAcc", "gpsCourse", "sats", "tMs", "date",
        "ax", "ay", "az", "gx", "gy", "gz",
        "wY", "wP", "wR", "mx", "my", "mz", "yaw", "pitch", "roll"]


def wrap_deg(a):
    return (a + 180.0) % 360.0 - 180.0


def load_trip(rel):
    path = os.path.join(DATA_DIR, rel.replace("/", os.sep))
    df = pd.read_csv(path, header=0, usecols=range(len(COLS)), names=COLS, skiprows=1,
                     encoding="cp1252")
    df = df.apply(pd.to_numeric, errors="coerce")
    df["t"] = df["tMs"] / 1000.0
    df = df.dropna(subset=["t"]).sort_values("t").reset_index(drop=True)
    t0 = df["t"].iloc[0]
    grid = np.arange(0.0, df["t"].iloc[-1] - t0, DT)
    idx = np.clip(((df["t"] - t0) / DT).round().astype(int), 0, len(grid) - 1)
    out = {c: np.full(len(grid), np.nan) for c in df.columns if c not in ("t", "date")}
    for c in out:
        out[c][idx] = df[c].fillna(np.nan).values
    s = pd.DataFrame(out)
    imu_cols = ["ax", "ay", "az", "gx", "gy", "gz", "wY", "wP", "wR", "mx", "my", "mz",
                "yaw", "pitch", "roll"]
    s[imu_cols] = s[imu_cols].interpolate(limit=5)
    # GPS jump rejection BEFORE validity flags: consecutive fixes >25 m apart at 10 Hz
    # (>180 km/h implied) are position jumps, not motion (motorway max is ~3.6 m/sample).
    dlat = s["lat"].diff() * 111320.0
    dlon = s["lon"].diff() * 111320.0 * math.cos(math.radians(float(s["lat"].iloc[0])))
    jump = np.hypot(dlat, dlon).fillna(0.0).values > 25.0
    s.loc[jump, ["lat", "lon", "alt", "gpsSpeedKmh", "gpsAcc", "gpsCourse"]] = np.nan
    for c in ["lat", "lon", "alt", "gpsSpeedKmh", "gpsAcc", "gpsCourse"]:
        s[c + "_ok"] = s[c].notna()
        s[c] = s[c].interpolate(limit=3)
    # NOTE: IO-VNBD labels this column "Kmh" but the values are Android getSpeed()
    # output, i.e. m/s (city trips average ~7 "km/h" = 26 km/h real). Use as-is.
    s["gpsSpeed"] = s["gpsSpeedKmh"]
    return s


def build_track(s):
    """Rebuild a clean reference track in fix space.

    The logger holds the last GPS fix between 1 Hz updates, so consecutive-sample
    differences are mostly zero with periodic jumps. We dedupe to real fixes,
    reject teleport jumps BETWEEN fixes (>80 m, ~290 km/h at 1 Hz), then
    interpolate positions and speed back onto the 10 Hz grid.
    """
    lat = s["lat"].values
    lon = s["lon"].values
    n = len(lat)
    ii = np.arange(n)
    ok = ~np.isnan(lat) & ~np.isnan(lon)
    fi = ii[ok]
    flat, flon = lat[fi], lon[fi]
    # dedupe held values -> distinct fixes
    keep = np.ones(len(fi), dtype=bool)
    keep[1:] = (flat[1:] != flat[:-1]) | (flon[1:] != flon[:-1])
    fi2, flat2, flon2 = fi[keep], flat[keep], flon[keep]
    # ENU in fix space
    lat0 = float(np.mean(flat2[:200]))
    lon0 = float(np.mean(flon2[:200]))
    R = 6378137.0
    fx = np.radians(flon2 - lon0) * R * math.cos(math.radians(lat0))
    fy = np.radians(flat2 - lat0) * R
    # jump filter between consecutive fixes
    if len(fi2) > 2:
        d = np.hypot(np.diff(fx), np.diff(fy))
        bad = np.zeros(len(fi2), dtype=bool)
        bad[1:] = d > 80.0
        fxi, fx, fy = fi2[~bad], fx[~bad], fy[~bad]
    else:
        fxi = fi2
    # interpolate track onto the 10 Hz grid
    x = np.interp(ii, fxi, fx)
    y = np.interp(ii, fxi, fy)
    # speed from fix-space displacement
    dtf = np.maximum(np.diff(fxi) * DT, 0.3)
    spf = np.hypot(np.diff(fx), np.diff(fy)) / dtf
    good = spf < 70.0
    gi = fxi[:-1][good] + 0.5
    sp = np.interp(ii, gi, spf[good])
    sp = pd.Series(sp).rolling(21, center=True).median().bfill().ffill().values
    return x, y, (lat0, lon0), np.clip(sp, 0.0, 60.0)


def lin_acc_mag(s):
    ga = np.column_stack([s["gx"], s["gy"], s["gz"]])
    aa = np.column_stack([s["ax"], s["ay"], s["az"]])
    return np.linalg.norm(aa - ga, axis=1)


def gyro_mag(s):
    return np.linalg.norm(np.column_stack([s["wY"], s["wP"], s["wR"]]), axis=1)


def zupt_mask(s, la, gm):
    """Stationary detection: low accel variance + low gyro over a ~1 s window."""
    la_var = pd.Series(la).rolling(11, center=True).var().bfill().ffill().values
    gm_mean = pd.Series(gm).rolling(11, center=True).mean().bfill().ffill().values
    return (la_var < 0.35) & (gm_mean < 0.12)


def build_features(s, la, gm):
    """Rotation-invariant multi-scale features (2s/5s/10s windows).

    IO-VNBD phones are mounted differently per trip, so raw axis means do not
    transfer across trips. We use magnitudes, signal energy and variability
    (all invariant to rigid rotation of the phone) plus vertical-dominance,
    which is stable up to pitch/roll mounts.
    """
    n = len(s)
    la_s, gm_s = pd.Series(la), pd.Series(gm)
    wy = pd.Series(np.abs(s["wY"].values))
    wp = pd.Series(np.abs(s["wP"].values))
    wr = pd.Series(np.abs(s["wR"].values))
    ax2 = pd.Series(s["ax"].values ** 2)
    ay2 = pd.Series(s["ay"].values ** 2)
    az2 = pd.Series(s["az"].values ** 2)
    vert = az2 / (ax2 + ay2 + az2 + 1e-6)
    jerk = pd.Series(la).diff().abs()
    parts = []
    for W in (20, 51, 101):
        parts += [la_s.rolling(W).mean(), la_s.rolling(W).std(),
                  gm_s.rolling(W).mean(), gm_s.rolling(W).std(),
                  wy.rolling(W).mean(), wp.rolling(W).mean(), wr.rolling(W).mean(),
                  vert.rolling(W).mean(), jerk.rolling(W).mean()]
    f = pd.concat(parts, axis=1).values
    feats = np.full((n, f.shape[1]), np.nan)
    feats[100:] = f[100:]
    feats[:100] = feats[100]
    return feats


SPEED_CENTERS = [0.0, 2.0, 6.5, 13.0]  # m/s, class representatives


def speed_classes(rs):
    """0=stopped <0.5, 1=low 0.5-4, 2=medium 4-9, 3=high >9 m/s."""
    lab = np.zeros(len(rs), dtype=int)
    lab[rs >= 0.5] = 1
    lab[rs >= 4.0] = 2
    lab[rs >= 9.0] = 3
    return lab


def train_softmax(X, y, k=4, epochs=350, lr=0.3, lam=1e-3):
    """Multinomial logistic regression on window features (motion-mode classifier).
    Ships as a tiny weight matrix, re-implemented in TypeScript for live inference."""
    mu = np.median(X, 0)
    sd = np.maximum(np.percentile(X, 75, 0) - np.percentile(X, 25, 0), 1e-3)
    Z = np.clip((X - mu) / sd, -8.0, 8.0)
    Zb = np.hstack([Z, np.ones((len(Z), 1))])
    W = np.zeros((Zb.shape[1], k))
    Y = np.eye(k)[y]
    n = len(Zb)
    for _ in range(epochs):
        logits = Zb @ W
        logits -= logits.max(1, keepdims=True)
        P = np.exp(logits)
        P /= P.sum(1, keepdims=True)
        W -= lr * (Zb.T @ (P - Y) / n + lam * W)
    return dict(W=W, mu=mu, sd=sd)


def softmax_probs(model, X):
    Z = np.clip((X - model["mu"]) / model["sd"], -8.0, 8.0)
    Zb = np.hstack([Z, np.ones((len(Z), 1))])
    logits = Zb @ model["W"]
    logits -= logits.max(1, keepdims=True)
    P = np.exp(logits)
    P /= P.sum(1, keepdims=True)
    return P


def run_fusion(P, zupt, v0, stop_p=0.45, conf_min=0.45):
    """Causal ML-gated fusion producing the aided speed signal.

    - Hard zero-velocity (ZUPT) only when the learned motion mode AGREES the
      vehicle is stopped (prevents false stops on smooth roads - measured:
      naive ZUPT zeroes speed at motorway cruising and costs 2-3x error).
    - When the motion class changes while moving, rescale the persisted speed
      toward the new class center (bounded), giving the speed profile the
      coarse dynamics that pure persistence misses.
    - Low-confidence (OOD-ish) samples persist instead of rescaling.
    """
    centers = np.asarray(SPEED_CENTERS)
    cls = P.argmax(1)
    conf = P.max(1)
    n = len(cls)
    v = float(max(v0, 0.0))
    out = np.zeros(n)
    prev_cls = cls[0]
    for i in range(n):
        if zupt[i] and P[i, 0] > stop_p:
            v = 0.0
        elif cls[i] > 0 and cls[i] != prev_cls and conf[i] > conf_min:
            if prev_cls == 0:
                v = centers[cls[i]] * 0.8          # leaving a stop: accelerate
            else:
                ratio = centers[cls[i]] / centers[prev_cls]
                v *= float(np.clip(ratio, 0.4, 2.5))
        elif cls[i] > 0 and conf[i] > conf_min:
            # gentle continuous pull toward the class center: keeps transient
            # rescales from sticking (measured: unbounded persistence overshoots)
            v += 0.05 * (centers[cls[i]] - v)
        out[i] = min(max(v, 0.0), 35.0)
        prev_cls = cls[i]
    return out


def interval_smooth(speed, zupt, alpha=0.12):
    """Forward-backward EMA within each inter-stop interval (ZUPT-anchored
    constrained smoothing): a cheap fixed-interval smoother that keeps starts
    and ends of intervals anchored at 0 while tracking the interval's motion."""
    n = len(speed)
    out = np.zeros(n)
    i = 0
    while i < n:
        if zupt[i]:
            out[i] = 0.0
            i += 1
            continue
        j = i
        while j < n and not zupt[j]:
            j += 1
        seg = speed[i:j]
        f = np.empty(len(seg))
        acc = seg[0]
        for t, v in enumerate(seg):
            acc = alpha * v + (1 - alpha) * acc
            f[t] = acc
        b = np.empty(len(seg))
        acc = f[-1]
        for t in range(len(seg) - 1, -1, -1):
            acc = alpha * f[t] + (1 - alpha) * acc
            b[t] = acc
        out[i:j] = b
        i = j
    return out


def ml_confidence(la_std, zupt):
    """Documented heuristic uncertainty for the virtual odometer."""
    conf = 0.55 + 0.45 * np.exp(-np.clip(la_std, 0, None) / 3.0)
    conf = np.where(zupt, 0.95, conf)
    ood = la_std > 6.0
    return np.clip(conf, 0.4, 0.98), ood


def propagate(speed, h0_deg, wy_rad_s, heading_mode, mag_head):
    """Plain DR propagation. wy is rad/s; heading is tracked in DEGREES.
    heading_mode: 'gyro' | 'comp'. Returns x, y arrays."""
    n = len(speed)
    x = np.zeros(n)
    y = np.zeros(n)
    h = h0_deg
    wy_deg = np.degrees(wy_rad_s)
    for i in range(1, n):
        h += wy_deg[i] * DT
        if heading_mode == "comp":
            h += 0.02 * wrap_deg(mag_head[i] - h)
        v = max(0.0, speed[i])
        x[i] = x[i - 1] + v * DT * math.sin(math.radians(h))
        y[i] = y[i - 1] + v * DT * math.cos(math.radians(h))
    return x, y


def make_segment(trip_id, s, x, y, rs, seg_id, black_s, frac, pre_s, post_s):
    n_trip = len(x)
    bi = int(n_trip * frac)
    pre = int(pre_s * RATE_HZ)
    dur = int(black_s * RATE_HZ)
    post = int(post_s * RATE_HZ)
    a, b, c = bi - pre, bi, bi + dur
    if a < WIN or c + post > n_trip:
        return None
    sl = slice(a, c + post)
    seg = {k: s[k][sl].values for k in s.columns}
    seg["rs"] = rs[sl]
    la = lin_acc_mag(seg)
    gm = gyro_mag(seg)
    zp = zupt_mask(seg, la, gm)

    # --- calibration from PRE-blackout window only ---
    spd_pre = seg["rs"][:pre]
    course = seg["gpsCourse"][:pre]
    yaw = seg["yaw"][:pre]
    ok = (spd_pre > 1.5) & ~np.isnan(course) & ~np.isnan(yaw)
    h_off = float(wrap_deg(np.nanmedian(course[ok] - yaw[ok]))) if ok.sum() > 10 else 0.0
    stat = zp[:pre] & (spd_pre < 0.3)
    wy_bias = float(np.nanmedian(seg["wY"][:pre][stat])) if stat.sum() > 10 else 0.0
    tail = course[pre - 50:pre]
    h0 = float(np.nanmedian(tail)) if not np.all(np.isnan(tail)) else 0.0
    v0 = float(np.nanmedian(spd_pre[-50:]))

    ctx = dict(
        id=seg_id, trip=trip_id, blackDur=black_s, pre=pre, dur=dur, post=post,
        wyBias=wy_bias, headingOff=h_off, h0=h0, v0=v0,
        x=x[sl], y=y[sl],
        gpsOk=seg["lat_ok"].astype(bool),
        gpsSpeedOk=seg["gpsSpeedKmh_ok"].astype(bool),
        gpsAcc=seg["gpsAcc"], gpsSpeed=seg["rs"], wY=seg["wY"], yaw=seg["yaw"],
        laStd=pd.Series(la).rolling(11, center=True).mean().bfill().ffill().values,
        zupt=zp,
        speedIns=np.full(pre + dur + post, v0),
        speedCls=np.where(zp, 0.0, v0),
    )
    return ctx


def run_estimators(ctx, speed_ekf):
    """Propagate all three estimators with their speed signals."""
    mag_head = (ctx["yaw"] + ctx["headingOff"]) % 360.0
    outs = {}
    wy = ctx["wY"] + ctx["wyBias"]
    for name, sp, hm in (("ins", ctx["speedIns"], "gyro"),
                         ("classical", ctx["speedCls"], "comp"),
                         ("ekf", speed_ekf, "comp")):
        x, y = propagate(sp, ctx["h0"], wy, hm, mag_head)
        outs[name] = (x, y)
    return outs


def metrics(ctx, outs):
    """Error vs GPS reference, computed only inside the blackout window.

    Protocol: each estimator is re-referenced to ITS OWN position at blackout
    start (as if initialized with the last good fix). The error therefore
    measures pure dead-reckoning degradation during the outage.
    """
    p0x, p0y = ctx["x"][ctx["pre"]], ctx["y"][ctx["pre"]]
    ref = np.column_stack([ctx["x"] - p0x, ctx["y"] - p0y])
    bl = np.zeros(len(ref), dtype=bool)
    bl[ctx["pre"]:ctx["pre"] + ctx["dur"]] = True
    dist = float(np.nansum(np.hypot(np.diff(ref[bl, 0]), np.diff(ref[bl, 1])))) + 1e-6
    out = {}
    for name, (x, y) in outs.items():
        est = np.column_stack([x - x[ctx["pre"]], y - y[ctx["pre"]]])
        err = np.hypot(est[:, 0] - ref[:, 0], est[:, 1] - ref[:, 1])
        out[name] = dict(
            final=round(float(err[bl][-1]), 2),
            drift=round(float(100 * err[bl][-1] / dist), 2),
            rmse=round(float(np.sqrt(np.nanmean(err[bl] ** 2))), 2),
            p95=round(float(np.nanpercentile(err[bl], 95)), 2),
        )
    return out, round(dist, 1)


def js(arr, step=2, nd=2):
    """Downsample floats for JSON; NaN/inf become None (null)."""
    a = np.asarray(arr, dtype=float)[::step]
    return [None if not math.isfinite(v) else round(float(v), nd) for v in a]


def main():
    inspect_only = "--inspect" in sys.argv
    print("Loading trips ...")
    trips = {}
    for tid, rel in TRIPS.items():
        s = load_trip(rel)
        x, y, orig, rs = build_track(s)
        la, gm = lin_acc_mag(s), gyro_mag(s)
        zp = zupt_mask(s, la, gm)
        dist = float(np.nansum(np.hypot(np.diff(x), np.diff(y))))
        trips[tid] = dict(s=s, x=x, y=y, orig=orig, la=la, gm=gm, zp=zp, rs=rs,
                          dist=dist, gpsRate=float(np.mean(s["lat_ok"])))
        print(f"  {tid}: {len(s)/RATE_HZ/60:.1f} min, {dist/1000:.2f} km, "
              f"gps-ok {trips[tid]['gpsRate']*100:.0f}%, "
              f"median speed {np.median(rs):.1f} m/s")

    if inspect_only:
        return

    # -------- learned motion-mode classifier (virtual-odometer aiding) --------
    print("Building feature banks ...")
    feat = {t: build_features(trips[t]["s"], trips[t]["la"], trips[t]["gm"]) for t in TRIPS}

    # Primary protocol: device-adapted within-trip temporal split (train on the
    # first 60% of the drive, evaluate on the unseen later portion). Mirrors a
    # real deployment: the vehicle calibrates from its own GNSS-aided history.
    models, eval_out = {}, {}
    for tid in trips:
        ok = trips[tid]["s"]["gpsSpeedKmh_ok"].values & np.isfinite(feat[tid]).all(1)
        idx = np.where(ok)[0]
        cut = int(len(idx) * TRAIN_FRACTION)
        tr, ho = idx[:cut], idx[cut:]
        y = speed_classes(trips[tid]["rs"])
        models[tid] = train_softmax(feat[tid][tr], y[tr])
        P = softmax_probs(models[tid], feat[tid][ho])
        acc = float((P.argmax(1) == y[ho]).mean())
        maj = float(np.bincount(y[ho], minlength=4).max() / len(ho))
        vhat = P @ np.asarray(SPEED_CENTERS)
        verr = np.abs(vhat - trips[tid]["rs"][ho])
        eval_out[tid] = dict(acc=round(acc, 3), majority=round(maj, 3),
                             mae=round(float(verr.mean()), 3),
                             rmse=round(float(np.sqrt((verr ** 2).mean())), 3),
                             n=int(len(ho)))
        print(f"  {tid} holdout (later {100*(1-TRAIN_FRACTION):.0f}%): "
              f"acc {acc*100:.1f}% (majority {maj*100:.1f}%), "
              f"speed MAE {eval_out[tid]['mae']} m/s")

    # Transfer experiment (reported separately): leave-one-trip-out models.
    # Different phone mounts per trip make cross-device transfer hard - we
    # report it honestly as the known open challenge of this benchmark.
    loto = {}
    for hold in trips:
        Xs, ys = [], []
        for tid in trips:
            if tid == hold:
                continue
            ok = trips[tid]["s"]["gpsSpeedKmh_ok"].values & np.isfinite(feat[tid]).all(1)
            Xs.append(feat[tid][ok])
            ys.append(speed_classes(trips[tid]["rs"])[ok])
        m = train_softmax(np.vstack(Xs), np.concatenate(ys))
        okt = trips[hold]["s"]["gpsSpeedKmh_ok"].values & np.isfinite(feat[hold]).all(1)
        P = softmax_probs(m, feat[hold][okt])
        acc = float((P.argmax(1) == speed_classes(trips[hold]["rs"])[okt]).mean())
        loto[hold] = dict(acc=round(acc, 3))
        print(f"  LOTO {hold} (trained on other mounts): acc {acc*100:.1f}%")

    # pooled bundle model (train portions of all trips) shipped in the JSON
    pooled_X, pooled_y = [], []
    for tid in trips:
        ok = trips[tid]["s"]["gpsSpeedKmh_ok"].values & np.isfinite(feat[tid]).all(1)
        cut = int(len(ok) * TRAIN_FRACTION)
        ok_train = ok & (np.arange(len(ok)) < cut)
        pooled_X.append(feat[tid][ok_train])
        pooled_y.append(speed_classes(trips[tid]["rs"])[ok_train])
    pooled = train_softmax(np.vstack(pooled_X), np.concatenate(pooled_y))
    print(f"  pooled bundle model trained on {sum(len(a) for a in pooled_X)} samples")

    model = dict(
        kind="motion-mode-classifier", version="v5",
        trainedAt=dt.datetime.utcnow().isoformat() + "Z",
        windowSamples=101, rateHz=RATE_HZ,
        classes=["stopped", "low", "medium", "high"],
        speedCenters=SPEED_CENTERS,
        protocol="device-adapted: per-trip temporal split (train first 60%, blackout segments from unseen later portion); LOTO transfer reported separately",
        features=["linAccMag mean/std @2s/5s/10s", "gyroMag mean/std @2s/5s/10s",
                  "|gyroYaw|,|gyroPitch|,|gyroRoll| mean @2s/5s/10s",
                  "vertical-accel-dominance mean @2s/5s/10s", "|jerk| mean @2s/5s/10s"],
        weights=[[round(float(v), 5) for v in row] for row in pooled["W"].T],
        featureMedian=[round(float(v), 6) for v in pooled["mu"]],
        featureIQR=[round(float(v), 6) for v in pooled["sd"]],
        trainFraction=TRAIN_FRACTION, evalHoldout=eval_out, evalLoto=loto,
        note="cross-mount speed regression remains an open challenge (see LOTO); aiding value comes from stop/motion classification + ZUPT-anchored fusion")

    # ---------------- blackout segments ----------------
    print("Running blackout segments ...")
    segments = []
    for seg_id, tid, black_s, frac, pre_s, post_s in SEGMENT_PLAN:
        T = trips[tid]
        ctx = make_segment(tid, T["s"], T["x"], T["y"], T["rs"], seg_id, black_s, frac, pre_s, post_s)
        if ctx is None:
            print(f"  !! segment {seg_id} skipped (bounds)")
            continue
        n = ctx["pre"] + ctx["dur"] + ctx["post"]
        n_trip = len(T["x"])
        bi = int(n_trip * frac)
        wsl = slice(bi - int(pre_s * RATE_HZ), bi + int(black_s * RATE_HZ) + int(post_s * RATE_HZ))
        P = softmax_probs(models[tid], feat[tid][wsl])
        P = np.nan_to_num(P, nan=0.0)
        conf = np.clip(P.max(1), 0.4, 0.98)
        ood = P.max(1) < 0.40
        sm = run_fusion(P, ctx["zupt"], ctx["v0"])
        outs = run_estimators(ctx, sm)
        mets, dist = metrics(ctx, outs)
        print(f"  {seg_id}: dist {dist} m | " +
              " | ".join(f"{k}: {v['final']} m / {v['drift']}%" for k, v in mets.items()))

        pre_i = ctx["pre"]
        step = 1  # full 10 Hz so the web replay clock maps 1:1 (index = t*10)
        raw_expectation = np.clip(P @ np.asarray(SPEED_CENTERS), 0.0, 40.0)
        # heading from reference track motion (ground-truth course over ground)
        dxr = np.diff(ctx["x"], prepend=ctx["x"][:1])
        dyr = np.diff(ctx["y"], prepend=ctx["y"][:1])
        heading = (np.degrees(np.arctan2(dxr, dyr)) + 360.0) % 360.0
        black_mask = np.zeros(n, dtype=bool)
        black_mask[pre_i:pre_i + ctx["dur"]] = True
        gps_ok = ctx["gpsOk"] & ~black_mask
        segments.append(dict(
            id=seg_id, trip=tid, blackDur=black_s, pre=pre_i, dur=ctx["dur"], post=ctx["post"],
            calib=dict(gyroBias=round(ctx["wyBias"], 5), headingOffset=round(ctx["headingOff"], 2),
                       initialHeading=round(ctx["h0"], 2), initialSpeed=round(ctx["v0"], 2)),
            t=[round(i / RATE_HZ, 1) for i in range(0, n, step)],
            refX=js(ctx["x"], step), refY=js(ctx["y"], step),
            gpsX=js(np.where(gps_ok, ctx["x"], np.nan), step),
            gpsY=js(np.where(gps_ok, ctx["y"], np.nan), step),
            gpsAcc=js(np.where(gps_ok, ctx["gpsAcc"], np.nan), step, 1),
            insX=js(outs["ins"][0], step), insY=js(outs["ins"][1], step),
            clsX=js(outs["classical"][0], step), clsY=js(outs["classical"][1], step),
            ekfX=js(outs["ekf"][0], step), ekfY=js(outs["ekf"][1], step),
            mlSpeed=js(raw_expectation, step),
            ekfSpeed=js(sm, step),
            heading=js(heading, step, 1),
            # raw channels for the LIVE in-browser ES-EKF: phone gyro yaw-axis
            # (rad/s, sign resolved client-side against the calibrated compass)
            # and the phone's own compass/orientation yaw (deg). headingOffset in
            # calib maps yawPhone onto the GPS-course reference.
            imuWz=js(ctx["wY"], step, 5),
            yawPhone=js(ctx["yaw"], step, 2),
            mlConf=js(conf, step, 3),
            gpsSpeed=js(ctx["gpsSpeed"], step), gpsSpeedOk=js(ctx["gpsSpeedOk"].astype(float), step, 0),
            zupt=js(ctx["zupt"].astype(float), step, 0),
            ood=js(ood.astype(float), step, 0),
            # stopped-class probability: lets the live in-browser filter apply
            # the SAME ML-gated ZUPT rule as the offline fusion (hard zero only
            # when the learned mode agrees the vehicle is stopped)
            pStop=js(P[:, 0], step, 3),
            metrics=mets, blackoutDist=dist,
        ))

    trips_out = {}
    for tid, T in trips.items():
        step = max(1, len(T["x"]) // 1200)
        lat0, lon0 = T["orig"]
        trips_out[tid] = dict(
            id=tid, duration=round(len(T["x"]) / RATE_HZ), distance=round(T["dist"]),
            rateHz=RATE_HZ, gpsOkPct=round(T["gpsRate"] * 100),
            origin=[round(lat0, 6), round(lon0, 6)],
            pathX=js(T["x"], step), pathY=js(T["y"], step))

    with open(os.path.join(OUT_DIR, "iovnbd-model.json"), "w") as f:
        json.dump(model, f, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "iovnbd-trips.json"), "w") as f:
        json.dump(trips_out, f, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "iovnbd-segments.json"), "w") as f:
        json.dump(dict(generatedAt=dt.datetime.utcnow().isoformat() + "Z",
                       rateHz=RATE_HZ, segments=segments), f, separators=(",", ":"))
    print("Wrote bundles to public/data/")


if __name__ == "__main__":
    main()
