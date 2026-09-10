import type { Config, Scenario } from "./types";
export const mainRoad = [
  { x: 120, y: 595 },
  { x: 240, y: 560 },
  { x: 340, y: 492 },
  { x: 432, y: 430 },
  { x: 510, y: 394 },
  { x: 610, y: 394 },
  { x: 690, y: 354 },
  { x: 776, y: 293 },
  { x: 880, y: 252 },
  { x: 1010, y: 203 },
];
export const northRoad = [
  { x: 432, y: 430 },
  { x: 486, y: 326 },
  { x: 586, y: 286 },
  { x: 700, y: 265 },
  { x: 776, y: 293 },
  { x: 880, y: 252 },
  { x: 1010, y: 203 },
];
export const serviceRoad = [
  { x: 300, y: 550 },
  { x: 402, y: 506 },
  { x: 520, y: 467 },
  { x: 637, y: 462 },
  { x: 733, y: 418 },
  { x: 830, y: 360 },
  { x: 956, y: 313 },
];
export const scenarios: Scenario[] = [
  {
    id: "tunnel",
    name: "Tunnel passage",
    subtitle: "GNSS blackout",
    description:
      "Aster Avenue through the Meridian tunnel. Satellite trust falls, inertial motion continues, and returning fixes are checked.",
    start: 25,
    route: mainRoad,
    faults: [{ id: "default-shock", kind: "shock", at: 45 }],
  },
  {
    id: "urban",
    name: "Urban canyon",
    subtitle: "Multipath & road ambiguity",
    description:
      "A route through North Ramp with closely spaced roads and a biased GNSS observation on approach.",
    start: 30,
    route: [...mainRoad.slice(0, 4), ...northRoad.slice(1)],
    faults: [{ id: "default-jump", kind: "gnss", at: 18 }],
  },
  {
    id: "mount",
    name: "Mount recovery",
    subtitle: "Phone alignment fault",
    description:
      "A phone rotates during the tunnel blackout. Learned aiding is suspended while alignment recovers.",
    start: 25,
    route: mainRoad,
    faults: [{ id: "default-mount", kind: "mount", at: 52 }],
  },
];
export const defaultConfig: Config = {
  scenario: "tunnel",
  blackout: 60,
  learned: true,
  map: true,
  seed: 26168,
  faults: [],
};
