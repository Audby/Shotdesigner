# 3D Studio

Open a lighting diagram in **2D plan**, then choose **3D studio** in the top bar.
The diagram becomes the initial set: physical elements receive 3D models, and diagram
cameras become shot cameras. Text and plan annotations stay in the 2D plan.

The toolbar has two modes: **Set** (build and light the space) and **Camera** (look
through the active shot camera and compose). Press **C** to switch.

## Scale: how the plan becomes a set

- Positions use metres. Y is height; X and Z are the plan axes. North is the top of the plan.
- Walls, floor areas, rugs, fences, curtains, backdrops, roller doors and water are
  drawn to length in the plan, so they use their drawn footprint.
- Library icons you have not resized carry no measurement, so they get real-world
  sizes (a car is 1.8 × 4.3 m even though its icon is small). Resize an icon in 2D
  and the 3D object follows your measurement.
- **Set & light → Scale** sets diagram units per metre (default 100) and has
  **Reset sizes from 2D plan**. Older scenes are upgraded automatically the first
  time they open; undo restores the previous sizes.
- Positions, yaw, size, visibility and locks stay linked to the 2D plan. Height,
  pitch, roll, colour, pose and light settings belong to the 3D scene.

## Building the set

- **Library:** filter by category chips or search. Click an asset to place it at the
  centre of the view, or **drag it into the viewport** to drop it exactly where you
  want. Dropped assets land on table tops, platforms and other flat surfaces.
- **Select** by clicking. The selection gets an outline; hovering shows what you are
  about to pick. **Drag a selected object** to slide it across its resting plane (walls
  and other architecture use the gizmo only, so orbiting never moves them by accident).
- **1 / 2 / 3** switch the gizmo between move, rotate and resize. **Snap** uses 10 cm,
  15° and 5% steps.
- The Object inspector offers exact position/size/rotation, **Drop to floor**, **Turn
  90°**, colour, actor pose (standing, walking, sitting, lying), and light colour,
  intensity and beam angle for fixtures.
- **In scene** lists every object with show/hide and lock; double-click a row to frame it.
- **Keyboard:** hold **⌥ W/A/S/D** to slide the selection relative to your view,
  **⌥ Q/E** to lower/raise it (add ⇧ for speed), and **⌥ J/K/L** to turn it around its
  yaw/pitch/roll axes (⇧ reverses). Arrow keys nudge 10 cm along the grid (⇧ 1 m),
  **⌥ ↑/↓** raises or lowers, and **[ / ]** turn 15°. Each held key or burst of arrow
  presses is one undo step. These work in Camera mode too, so you can block while
  looking through the lens. (⌘ combinations are taken by the app and the system: ⌘W
  closes the window and ⌘Q quits.)
- Navigate with drag (orbit), right-drag (pan), scroll (zoom toward the cursor),
  double-click (focus), **F** (frame selection or set), **T** (plan view from above),
  and **WASD / Q / E** to walk.
- **Import GLB model** accepts self-contained, uncompressed glTF 2.0 files up to 25 MB.
  The model is embedded in the scene file.

## Set and light

- **Film lights:** open-face spot, Fresnel 1K, HMI 1.2K, Dedolight, softbox, LED panel,
  SkyPanel, Kino Flo 4-bank, light tube, ring light, China ball and space light.
  **Practicals:** bare bulb, table and floor lamps, pendant, fluorescent batten, neon
  sign, string lights, candle, street lamp, flashlight, campfire and standing torch.
  **Grip:** bounce board, black flag, V-flat and diffusion frame.
- Soft sources (softbox, panels, SkyPanel, Kino, ring, neon, batten) are real area
  lights that wrap around subjects. The **light tube** glows on all sides like an
  Astera/Lyssabel rod; plan elements labelled Lyssabel, Astera, Titan or tube become
  light tubes automatically. Hard sources (spots, Fresnels, HMI, Dedo, street lamp,
  flashlight) aim along the front of the fixture; up to four cast shadows.
- The Object inspector's **Light** section has a **dimmer** (0–300 % of the
  fixture's typical output), **colour temperature** in Kelvin with presets (candle,
  household, tungsten, mixed, daylight, overcast), **gels** (CTO, CTB, moonlight,
  fire, neon pink, cyan, green, red) and a custom colour. Spots also have a beam angle.
- Hanging and wall fixtures (pendant, batten, neon, string lights, space light,
  flashlight) arrive at a working height when placed.
- **Time of day** presets (morning, noon, golden hour, overcast, studio, night) set
  the sun and sky together. **Sun direction** and **Sun height** aim the sunlight and
  its shadows; low sun turns warmer.
- **Stage:** floor size and colour, sky/horizon colour, **Ceiling over walls** (seen
  from inside only, so the overview stays open), and **Wall treatment** (built or cave
  rock).
- **View ▾** toggles the grid/cameras/beams (**G**), contact shadows (ambient
  occlusion) and **actor names**: a name tag above each person, shown in the set and
  camera views but never in stills or video. Contact shadows also apply to captured stills and clips.

## Blocking: actors and objects that move

Objects can move during a shot, the same way the camera does. Movement is stored per
shot, so each shot of a scene can block its actors differently.

1. With the playhead at 0 s, place everyone on their starting marks. At 0 s you are
   editing the set, and the 2D plan shows these starting positions.
2. Move the playhead, then move or turn an actor (drag, gizmo, keyboard or inspector).
   With **Auto-key** on (beside the timeline), that sets a mark at the playhead.
3. Press **Space**. The actor walks between marks, following the shot's ease setting.

A selected moving object shows its marks as circles in a second timeline lane (drag to
retime, double-click to delete) and as a dashed trail on the floor. The Object
inspector's **Movement** section lists the marks and has **Mark here** and **Stop
moving**. With Auto-key off, moving a still object edits the set instead; objects that
already move always record a mark. Size and colour are not animated.

## Cameras and movement

Every shot camera appears in the set as a camera body with a frame-shaped frustum
reaching to its aim point. Click a camera body to make it active and select it; drag
its gizmo to reposition it (it keeps aiming at the same point). The shot strip under the
viewport lists all cameras with their reference thumbnails; double-click one to look
through it. **＋ Camera** creates a camera from the current set view.

In **Camera** mode the viewport shows the exact frame format:

- **Pan · tilt / Truck · pedestal / Orbit** set what a drag does. Pan and tilt follow the
  pointer (drag right to pan right, down to tilt down); truck and orbit move the scene
  with the pointer. Shift-drag or
  right-drag always trucks. **Alt-drag** sets a Dutch angle. Scroll dollies.
- The lens bar picks 14–135 mm; the HUD reads focal length, camera height, tilt,
  Dutch angle, distance to the aim point and horizontal field of view.
- **Frame guides** (View ▾): rule of thirds, action/title safe, centre mark.
- The Camera inspector has lens and sensor presets (full frame, Super 35, ALEXA LF,
  APS-C, Micro 4/3), frame formats, **Wide / Medium / Close-up** framing of a subject,
  **Height** presets (ground, low, chest, eye, high, overhead), a **Dutch angle**
  slider with **Level horizon** / **Level tilt**, and exact position values.

Each completed gesture sets one keyframe at the playhead and one undo step. To make a move:

1. Frame the start at 0 s.
2. Move the playhead (click or drag the timeline; it snaps to 24 fps frames).
3. Reframe. A new keyframe appears.
4. Press **Space** to play.

Drag keyframe diamonds to retime (Alt for free timing), double-click one to delete it,
or use **◆ Add/Update key** (**K**) and **⌫**. **, / .** jump between keyframes. The
duration field beside the playhead retimes the whole move (0.5–3600 s). Paths can be
straight or curved (three or more keys), with optional ease in/out. Position, aim,
lens and Dutch angle all animate.

In Set view the move is drawn as a dashed path with keyframe markers.

### Depth of field

Turn on **Depth of field** under Lens & format, or with **DOF** in the camera
view's lens bar. Choose an f-stop (f/1.4–f/16). Focus follows the aim point, so it pulls
with the move, or can be fixed at a distance; **Focus on selected object** sets it
for you. The inspector shows the near and far limits of sharpness. The blur is computed
from focal length, f-stop, focus distance and sensor width, and appears in the camera
view, stills and clips (not in the small monitor).

## Shot list, scenes and sets

A shot-list **scene** (for example Scene 6) is staged in one **set**: a 2D plan with
its 3D studio. Each **shot** in that scene is a camera in the set.

- In the shot list, the scene header shows its set. **Create set** makes one named
  after the scene, or you can choose an existing plan. Each shot row has **2D** and
  **3D** buttons (shortcuts **C** and **V**). **3D** opens the set looking through that
  shot's camera, and creates the camera on first use, taking the lens from "Camera &
  lens" (for example "35mm") when it can.
- A shot can be staged in a different set with the **⋯** menu on its row (for example a
  pickup on another location); **Use the scene set** returns it.
- In the 2D plan and the 3D studio, a **shot bar** under the top bar shows the scene
  and its shots. Click a shot to switch to it (in 3D this looks through its camera).
  **＋ Shot** adds a shot to the scene (and a camera, in 3D). **Shot details** edits the
  description, framing, movement, lens, notes and status in place. Click the scene name
  to jump back to the shot list.
- Camera chips under the 3D viewport show the shot number they belong to.
- Earlier per-shot canvas links keep working; they now count as "own set" links.

Save both the scene and the shot list to keep links.

## References and video

**Capture still** downloads a 1920 px frame and saves a smaller reference thumbnail with
the camera.

**Export video…** opens the export dialog:

- **This shot**, or **all shots in order** as one continuous video (an animatic of the
  scene, following the camera strip order).
- **MP4 (H.264)** for editing software and sharing, or **WebM (VP9)**.
- **720p, 1080p or 4K**, at **24, 25 or 30 fps**.
- Optional **burn-in** of the scene and shot name with running and per-shot timecode.

Every frame is rendered and encoded in turn at full quality, including contact
shadows, depth of field, lighting and moving actors, so nothing is dropped. Short
clips usually render faster than real time; 4K takes longer. The export can be
canceled. When shots use different frame formats, a sequence uses the first shot's
format. Browsers without WebCodecs fall back to a real-time WebM recording of the
active shot. Helpers never appear in exports.

## Performance

Shadows and the camera monitor redraw only when something in the set changes, not
while you orbit. Contact shadows pause during camera movement and return as soon as
it stops. If a very large set is still slow, turn off **Contact shadows (AO)** in View ▾.

## Current limits

This is a previsualization tool with stylized geometry and approximate lighting. It
does not predict measured exposure, use calibrated fixture photometry, animate
actors' limbs (they glide between marks in a fixed pose), or record sound. Lighting is
shared by every shot in a set; per-shot lighting is a future addition. Captured thumbnails
represent the scene at capture time.

## Development checks

Run `npm test`, `npm run lint`, and `npm run build`. Tests cover diagram conversion
and real-world icon sizing, legacy upgrades, bidirectional transforms, reconciliation,
film-camera projection, Dutch roll, per-shot blocking, lighting fixtures, scene sets, interpolation, keyframe timing, model bounds and
legacy shot-list compatibility.

## Keyboard

Press **?** (or **Shortcuts** in the header) for the full list for the current workspace.
Shortcuts pause while you type. The desktop close button asks before discarding unsaved work.
