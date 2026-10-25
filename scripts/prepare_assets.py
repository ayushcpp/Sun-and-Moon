# /// script
# requires-python = "==3.11.*"
# dependencies = ["numpy>=1.26", "pillow>=10", "scipy>=1.11", "opencv-contrib-python-headless>=4.9"]
# ///
"""Cut the storybook images into layers.  Run: npm run assets  (uv, Python 3.11)

Inputs (project root): "Sun and Moon.jpeg", Hands.png, Faces2.png.
Outputs: public/story/*.png|jpg (layers) and src/generated/story.ts (sizes,
anchors, the moon's outline, eyelid curves). assets-preview.png shows every
cut-out and eyelid curve for checking.
"""
import json
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.interpolate import PchipInterpolator

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "story"
PREVIEW = ROOT / "assets-preview.png"  # for checking by eye; outside public/ so it is not deployed
TS_OUT = ROOT / "src" / "generated" / "story.ts"

# Hand-measured on a pixel grid (see PLAN.md). Everything else is derived.
SUN_CENTRE, SUN_ZONE_R = (428, 235), 350
MOON_ZONE = (925, 25, 1455, 540)  # x0, y0, x1, y1
MOON_RIM = 18  # px: the crescent's dark outline and drop shadow reach this far past its gold
SEAM_SOFT = (6, 24)  # px: in the painted-over sky, detail finer than [0] stays; tones blur over [1]
# The painted-over sky's finest grain (see regrain): the fill's own detail keeps what is coarser than
# `soft` px; the rest is the painting's own grain, in `tile` px tiles (half overlapping) from plain sky
# picked by `seed`. Painted stars keep their pixels: specks warmer than the sky and `lift` luma levels
# (of 255) above their surroundings, or 3x that in any colour.
REGRAIN = dict(soft=3.0, tile=64, seed=7, lift=14)
FACES = "Faces2.png"
GOLD_LUMA = 0.28
STAR_MAX_Y = 470  # big stars live above this line; below it gold bits are cloud tops
HANDS = {
    # tip: index fingertip; pivot: where the arm leaves the picture (the puppet's shoulder).
    "moon": dict(seed=(300, 330), tip=(532, 468), pivot=(0, 120)),
    "sun": dict(seed=(800, 800), tip=(562, 582), pivot=(1211, 1225)),
}
# Each eye's almond on Faces2.png, as its upper lid (the bottom of the drawn lid
# stroke) and lower lid (the top of the lower lid line), traced through many points
# (pixel edges read off luma profiles) from tip to tip, where the drawn strokes meet
# past the caruncle at the nose; the moon's temple ends are blunt. The iris drawing
# and the hatching inside the eye defeat a flood fill or a column scan, so they are
# measured by hand. A lid that misses its stroke leaves a dark slit when shut.
EYES = {
    "sunLeft": dict(
        upper=[(250, 279), (252, 273), (256, 271), (262, 270), (279, 263), (295, 256), (311, 250), (327, 245), (343, 241),
               (359, 238), (375, 235), (391, 234), (407, 233), (423, 233), (439, 234), (455, 236), (471, 239), (487, 242),
               (503, 247), (519, 252), (535, 259), (551, 266), (567, 275), (583, 286), (590, 290), (600, 299), (608, 305),
               (615, 312)],
        lower=[(250, 279), (252, 284), (256, 288), (262, 290), (279, 295), (295, 297), (311, 299), (327, 300), (343, 302),
               (359, 303), (375, 305), (391, 305), (407, 307), (423, 307.5), (439, 308), (455, 307), (471, 307), (487, 307),
               (503, 307), (519, 308), (535, 311), (551, 311), (567, 312), (583, 311.5), (600, 311.5), (608, 311.5), (615, 312)],
    ),
    "sunRight": dict(
        upper=[(1030, 313), (1032, 305), (1035, 301), (1041, 289), (1047, 286), (1053, 281), (1059, 278), (1065, 273),
               (1079, 266), (1095, 256), (1111, 254), (1127, 245), (1143, 238), (1159, 233), (1175, 229), (1191, 226),
               (1207, 224), (1223, 223), (1239, 223), (1255, 225), (1271, 227), (1287, 231), (1303, 236), (1319, 242),
               (1335, 250), (1351, 258), (1367, 266), (1374, 266), (1378, 267), (1384, 272), (1385, 276)],
        lower=[(1030, 313), (1035, 312), (1047, 312), (1063, 313), (1079, 311), (1095, 309), (1111, 308), (1127, 307),
               (1143, 308), (1159, 308.5), (1175, 309), (1191, 309), (1207, 308.5), (1223, 307.5), (1239, 308), (1255, 307),
               (1271, 307), (1287, 305), (1303, 303), (1319, 301), (1335, 297), (1351, 293), (1367, 288), (1374, 285),
               (1378, 280), (1384, 278), (1385, 276)],
    ),
    "moonLeft": dict(
        upper=[(257, 760), (258, 755), (259, 749), (261, 743), (263, 739), (265, 732), (268, 729), (274, 723), (280, 718),
               (286, 715), (292, 711), (298, 708), (304, 706), (310, 705), (316, 703), (322, 700), (328, 699), (334, 697),
               (340, 697), (360, 694), (380, 694), (400, 694), (420, 696), (440, 699), (450, 705), (460, 708), (470, 709),
               (480, 710), (490, 713), (496, 718), (500, 721),
               (520, 731), (532, 737), (544, 745), (556, 754), (568, 763), (574, 768), (586, 778), (594, 785), (602, 792),
               (610, 798), (616, 802)],
        lower=[(257, 760), (258, 767), (259, 769), (260, 771), (262, 775), (264, 778), (266, 780), (268, 783), (274, 790),
               (280, 796), (286, 799), (292, 802), (298, 804), (304, 806), (310, 807), (316, 808), (328, 808), (340, 809),
               (360, 810), (380, 810), (400, 810), (420, 808), (440, 805), (460, 803), (480, 800), (500, 799), (520, 795),
               (538, 793), (562, 792), (578, 792), (590, 795), (600, 798), (610, 800), (616, 802)],
    ),
    "moonRight": dict(
        upper=[(1064, 797), (1072, 791), (1080, 786), (1092, 774), (1104, 763), (1112, 756), (1120, 750), (1130, 742),
               (1150, 730), (1170, 720), (1190, 712), (1210, 706), (1230, 701), (1250, 694), (1270, 693), (1290, 693),
               (1310, 692), (1330, 695), (1340, 697), (1348, 699), (1356, 702), (1364, 704), (1372, 707), (1380, 710),
               (1388, 714), (1396, 720), (1400, 723), (1404, 727), (1408, 734), (1410, 738), (1412, 743), (1414, 753),
               (1415, 758)],
        lower=[(1064, 797), (1072, 793), (1080, 795), (1088, 793), (1096, 792), (1104, 791), (1112, 790), (1130, 790),
               (1150, 792), (1170, 794), (1190, 797), (1210, 800), (1230, 803), (1250, 804), (1270, 805), (1290, 807),
               (1310, 807), (1330, 807), (1344, 806), (1352, 805), (1360, 804), (1368, 803), (1376, 801), (1384, 797),
               (1392, 794), (1396, 791), (1400, 787), (1404, 782), (1408, 777), (1410, 774), (1412, 770), (1414, 765),
               (1415, 758)],
    ),
}
# Traced lids move this far (px) into their strokes, so no dark interior rides on a closing lid.
LID_INSET = 1.0


def disk(r):
    y, x = np.ogrid[-r : r + 1, -r : r + 1]
    return x * x + y * y <= r * r


def load(name):
    return np.asarray(Image.open(ROOT / name).convert("RGB")).astype(np.float32) / 255


def luma(img):
    return img @ np.array([0.2126, 0.7152, 0.0722], np.float32)


BGR_LUMA = np.array([0.0722, 0.7152, 0.2126], np.float32)  # luma() for OpenCV's BGR order


def feather(mask, sigma=1.0):
    return np.clip(ndi.gaussian_filter(mask.astype(np.float32), sigma), 0, 1)


def largest(mask):
    lab, n = ndi.label(mask)
    if n == 0:
        return mask
    sizes = ndi.sum(mask, lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def save_cutout(img, alpha, name, margin=4):
    ys, xs = np.nonzero(alpha > 0.01)
    x0, y0 = max(0, xs.min() - margin), max(0, ys.min() - margin)
    x1, y1 = min(img.shape[1], xs.max() + 1 + margin), min(img.shape[0], ys.max() + 1 + margin)
    rgba = np.dstack([img[y0:y1, x0:x1], alpha[y0:y1, x0:x1]])
    Image.fromarray((rgba * 255).round().astype(np.uint8), "RGBA").save(OUT / f"{name}.png", optimize=True)
    return [int(x0), int(y0), int(x1), int(y1)]


def lift(img):
    """How far each pixel of a BGR image stands above its surroundings, in luma levels (of 255)."""
    lum = img.astype(np.float32) @ BGR_LUMA
    return lum - cv2.medianBlur(np.clip(lum, 0, 255).astype(np.uint8), 13)


def fine_detail(img):
    """A BGR image less its tones: what is finer than SEAM_SOFT[0] px (star dots included)."""
    fine = SEAM_SOFT[0]
    return img.astype(np.float32) - cv2.GaussianBlur(cv2.medianBlur(img, 2 * fine + 1).astype(np.float32), (0, 0), fine)


def regrain(fill, detail, hole, painting, avoid):
    """
    The change to the fill's fine detail (BGR) that leaves no square pixel blocks in the hole.
    OpenCV's shift-map fills a copy of the picture shrunk to fit 800x600 and pastes it back in
    blocks of whole pixels: a staircase of squares wherever the sky is magnified (a phone draws it
    over 2 device px per picture px). Inside the hole the fill keeps its own detail only softened
    over REGRAIN soft px; the finest grain is the painting's own, from plain sky (outside `avoid`,
    its specks taken out) in feathered tiles at seeded random places, never louder than there and
    as quiet as the fill was. Painted stars in the fill keep their pixels.
    """
    H, W = hole.shape
    R = REGRAIN
    tile, step = R["tile"], R["tile"] // 2
    up = lift(fill)
    stars = ((up > R["lift"]) & (fill[..., 2] > fill[..., 0] + 4)) | (up > 3 * R["lift"])
    stars = feather(ndi.binary_dilation(stars, disk(2)), 1.0)[..., None]
    grain = fine_detail(painting) * (1 - feather(ndi.binary_dilation(lift(painting) > R["lift"] / 2, disk(2)), 1.0))[..., None]
    # Every place a whole tile of plain sky can come from (a summed-area table of `avoid`).
    sat = np.pad(np.cumsum(np.cumsum(avoid, 0), 1), ((1, 0), (1, 0)))
    clear = np.argwhere(sat[tile:, tile:] - sat[:-tile, tile:] - sat[tile:, :-tile] + sat[:-tile, :-tile] == 0)
    rng = np.random.default_rng(R["seed"])
    w = np.sin(np.pi * (np.arange(tile) + 0.5) / tile) ** 2
    window = np.outer(w, w)[..., None]
    total = np.zeros((H + 2 * tile, W + 2 * tile, 3), np.float32)
    weight = np.zeros((H + 2 * tile, W + 2 * tile, 1), np.float32)
    near = ndi.binary_dilation(hole, disk(4))
    for y in range(step - tile, H, step):
        for x in range(step - tile, W, step):
            if near[max(0, y) : y + tile, max(0, x) : x + tile].any():
                sy, sx = clear[rng.integers(len(clear))]
                total[y + tile : y + 2 * tile, x + tile : x + 2 * tile] += window * grain[sy : sy + tile, sx : sx + tile]
                weight[y + tile : y + 2 * tile, x + tile : x + 2 * tile] += window**2
    # Over the root of the summed squared weights, unrelated tiles keep their strength where they overlap.
    tiles = (total / np.sqrt(np.maximum(weight, 1e-6)))[tile:-tile, tile:-tile]
    finest = tiles - cv2.GaussianBlur(tiles, (0, 0), R["soft"])
    soft = cv2.GaussianBlur(detail, (0, 0), R["soft"])
    strength = lambda d: np.sqrt(cv2.GaussianBlur((d @ BGR_LUMA) ** 2, (0, 0), 12)) + 0.3
    gain = np.clip(strength((detail - soft) * (1 - stars)) / strength(finest), 0.5, 1.0)[..., None]
    return feather(hole, 1.5)[..., None] * (1 - stars) * (soft + gain * finest - detail)


def sky_layers(meta):
    img = load("Sun and Moon.jpeg")
    H, W, _ = img.shape
    lum = luma(img)
    gold = (lum > GOLD_LUMA) & (img[..., 0] > img[..., 2] + 0.05)
    yy, xx = np.mgrid[0:H, 0:W]

    # Clouds are the big gold masses connected to the bottom edge; the sun and moon never touch it.
    opened = ndi.binary_opening(gold, structure=np.ones((11, 11)))
    lab, _ = ndi.label(opened)
    clouds = np.isin(lab, list(set(np.unique(lab[-3:, :])) - {0}))
    padded = np.pad(ndi.binary_closing(clouds, structure=disk(9)), ((0, 4), (0, 0)), constant_values=True)
    cloud_solid = ndi.binary_fill_holes(padded)[:H]
    cloud_solid |= ndi.binary_dilation(clouds, disk(2)) & gold

    sun_zone = (xx - SUN_CENTRE[0]) ** 2 + (yy - SUN_CENTRE[1]) ** 2 < SUN_ZONE_R**2
    sun = ndi.binary_fill_holes(ndi.binary_closing(gold & sun_zone & ~cloud_solid, structure=disk(3)))
    lab, n = ndi.label(sun)
    keep = [i + 1 for i in range(n) if ndi.sum(sun, lab, i + 1) > 400]
    sun = np.isin(lab, keep)

    mx0, my0, mx1, my1 = MOON_ZONE
    moon_zone = (xx > mx0) & (xx < mx1) & (yy > my0) & (yy < my1)
    moon = largest(ndi.binary_fill_holes(ndi.binary_closing(gold & moon_zone, structure=disk(4))))

    # Big painted stars: compact gold shapes in the open sky (cloud tops also break into star-sized bits).
    open_sky = (yy < STAR_MAX_Y) & ~ndi.binary_dilation(cloud_solid, disk(12))
    rest = ndi.binary_closing(gold & ~sun_zone & ~moon_zone & open_sky, structure=disk(2))
    lab, n = ndi.label(rest)
    stars = []
    for i in range(1, n + 1):
        comp = lab == i
        area = int(comp.sum())
        if 250 < area < 8000:
            stars.append(ndi.binary_fill_holes(comp))

    # Sky plate: sun, moon and big stars removed and painted over from the surrounding sky.
    # The clouds stay in it; an identical cloud cut-out drawn on top lets the sun sink behind
    # them, and since both move together nothing ghosts.
    bgr = cv2.cvtColor((img * 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    bodies = sun.copy()
    for s in stars:
        bodies |= s
    hole = ndi.binary_dilation(bodies, disk(7)) | ndi.binary_dilation(moon, disk(MOON_RIM))
    plate = np.zeros_like(bgr)
    cv2.xphoto.inpaint(bgr, ((~hole) * 255).astype(np.uint8), plate, cv2.xphoto.INPAINT_SHIFTMAP)
    # Shift-map can copy stray gold fragments into the old sun's place: paint any
    # non-star-like bit over again, with shift-map too (smooth fills read as smudges).
    pf = cv2.cvtColor(plate, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    stray = (luma(pf) > 0.18) & (pf[..., 0] > pf[..., 2] + 0.08) & ndi.binary_dilation(hole, disk(4))
    lab, n = ndi.label(stray)
    fragments = np.zeros_like(stray)
    for i in range(1, n + 1):
        comp = lab == i
        if comp.sum() > 6:
            fragments |= comp
    if fragments.any():
        again = np.zeros_like(plate)
        cv2.xphoto.inpaint(plate, ((~ndi.binary_dilation(fragments, disk(4))) * 255).astype(np.uint8), again, cv2.xphoto.INPAINT_SHIFTMAP)
        plate = again
    # Shift-map pastes the sky in blocks, and a tone step between two blocks reads as a
    # straight seam. Inside the hole, keep the fine detail (grain, star dots) but take the
    # tones from a broad blur, so the seams melt into soft nebula.
    pf = plate.astype(np.float32)
    fine, broad = SEAM_SOFT
    base = cv2.medianBlur(plate, 2 * fine + 1).astype(np.float32)  # without the star dots, which would spread into halos
    smooth = pf - cv2.GaussianBlur(base, (0, 0), fine) + cv2.GaussianBlur(base, (0, 0), broad)
    inside = feather(ndi.binary_erosion(hole, disk(fine)), fine)[..., None]
    # And its finest grain is made again, without the fill's square blocks.
    avoid = ndi.binary_dilation(hole | cloud_solid, disk(3 * fine)) | ndi.binary_dilation(ndi.binary_opening(gold, disk(1)), disk(2 * fine))
    grain = regrain(plate, fine_detail(plate), hole, bgr, avoid)
    plate = np.clip(np.round(pf + inside * (smooth - pf) + grain), 0, 255).astype(np.uint8)
    plate_rgb = cv2.cvtColor(plate, cv2.COLOR_BGR2RGB)
    Image.fromarray(plate_rgb).save(OUT / "sky.jpg", quality=93)

    # Painted star dots left in the plate: small bright specks, for the twinkle.
    pl = luma(plate_rgb.astype(np.float32) / 255)
    specks = (pl > 0.42) & ~ndi.binary_dilation(cloud_solid, disk(3))
    lab, n = ndi.label(specks)
    sizes = ndi.sum(specks, lab, range(1, n + 1))
    dots = np.isin(lab, [i + 1 for i in range(n) if sizes[i] <= 60])
    twinkle = feather(ndi.binary_dilation(dots, disk(1)), 0.8)
    Image.fromarray((twinkle * 255).astype(np.uint8), "L").save(OUT / "sky_twinkle.png", optimize=True)

    meta["sky"] = {"size": [W, H]}
    meta["sun"] = {"box": save_cutout(img, feather(ndi.binary_dilation(sun, disk(1)), 0.8), "sun"), "centre": list(SUN_CENTRE)}
    moon_box = save_cutout(img, feather(ndi.binary_dilation(moon, disk(1)), 0.8), "moon")
    ys, xs = np.nonzero(moon)
    # The crescent's outline (convex hull, ~20 points within 3 px) keeps it on screen.
    hull = cv2.approxPolyDP(cv2.convexHull(np.column_stack([xs, ys]).astype(np.int32)), 3, True)[:, 0]
    meta["moon"] = {
        "box": moon_box,
        "centre": [round(float(xs.mean()), 1), round(float(ys.mean()), 1)],
        "hull": [[int(x), int(y)] for x, y in hull],
    }
    meta["stars"] = []
    for k, s in enumerate(sorted(stars, key=lambda m: np.nonzero(m)[1].mean())):
        ys, xs = np.nonzero(s)
        box = save_cutout(img, feather(ndi.binary_dilation(s, disk(1)), 0.7), f"star{k}")
        meta["stars"].append({"box": box, "centre": [round(float(xs.mean()), 1), round(float(ys.mean()), 1)]})
    cloud_alpha = feather(cloud_solid, 1.0)
    split = W // 2
    left = cloud_alpha.copy()
    left[:, split:] = 0
    right = cloud_alpha.copy()
    right[:, :split] = 0
    meta["clouds"] = {"left": {"box": save_cutout(img, left, "clouds_left")}, "right": {"box": save_cutout(img, right, "clouds_right")}}
    return {"sun": sun, "moon": moon, "stars": stars, "clouds": cloud_solid, "plate": plate_rgb}


def hand_layers(meta):
    img = load("Hands.png")
    lum = luma(img)
    ink = ndi.binary_closing(lum > 0.06, structure=disk(3))
    lab, _ = ndi.label(ink)
    meta["hands"] = {"size": [img.shape[1], img.shape[0]]}
    for name, h in HANDS.items():
        part = lab == lab[h["seed"][1], h["seed"][0]]
        part = ndi.binary_fill_holes(ndi.binary_closing(part, structure=disk(6)))
        box = save_cutout(img, feather(part, 0.9), f"hand_{name}")
        meta["hands"][name] = {"box": box, "tip": list(h["tip"]), "pivot": list(h["pivot"])}


def eye_curves(meta):
    """Upper and lower lid of each eye, one y per picture column from corner to corner."""
    img = load(FACES)
    H, W, _ = img.shape
    meta["faces"] = {"size": [W, H], "eyes": {}}
    found = {}
    for name, e in EYES.items():
        x0, x1 = e["upper"][0][0], e["upper"][-1][0]
        xs = np.arange(x0, x1 + 1)
        up, dn = (PchipInterpolator(*np.array(e[k], float).T)(xs) for k in ("upper", "lower"))
        inset = LID_INSET * np.clip((dn - up) / (4 * LID_INSET), 0, 1)  # none at the tips, where the lids meet
        up, dn = up - inset, dn + inset
        meta["faces"]["eyes"][name] = {
            "x": [int(x0), int(x1)],
            "upper": [round(float(y), 1) for y in up],
            "lower": [round(float(y), 1) for y in dn],
        }
        found[name] = (xs, up, dn)
    return img, found


def preview(sky, faces_img, eyes):
    W, H = sky["plate"].shape[1], sky["plate"].shape[0]
    p = Image.fromarray(sky["plate"]).convert("RGB")
    d = ImageDraw.Draw(p)
    for m, col in [(sky["sun"], (255, 90, 160)), (sky["moon"], (90, 150, 255)), (sky["clouds"], (255, 230, 120))] + [(s, (255, 255, 255)) for s in sky["stars"]]:
        edge = m ^ ndi.binary_erosion(m, disk(2))
        arr = np.asarray(p).copy()
        arr[edge] = col
        p = Image.fromarray(arr)
    f = Image.fromarray((faces_img * 255).astype(np.uint8))
    d = ImageDraw.Draw(f)
    for name, (xs, up, dn) in eyes.items():
        for ys, col in [(up, (255, 60, 60)), (dn, (60, 255, 60))]:
            d.line([(float(x), float(y)) for x, y in zip(xs, ys)], fill=col, width=2)
    canvas = Image.new("RGB", (W + f.size[0], max(H, f.size[1])))
    canvas.paste(p, (0, 0))
    canvas.paste(f, (W, 0))
    canvas.save(PREVIEW, optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.iterdir():  # generated folder: start clean so no stale layer survives
        old.unlink()
    meta = {}
    sky = sky_layers(meta)
    hand_layers(meta)
    faces_img, eyes = eye_curves(meta)
    Image.open(ROOT / FACES).convert("RGB").save(OUT / "faces.jpg", quality=92)
    preview(sky, faces_img, eyes)
    TS_OUT.parent.mkdir(parents=True, exist_ok=True)
    # Long number lists (the eyelids, one y per column) on one line each.
    text = re.sub(r"\[\s+(-?[\d.]+(?:,\s+-?[\d.]+){8,})\s+\]", lambda m: "[" + re.sub(r",\s+", ", ", m.group(1)) + "]", json.dumps(meta, indent=2))
    TS_OUT.write_text(
        "// Generated by scripts/prepare_assets.py (npm run assets). Do not edit by hand.\n"
        "// Pixel coordinates in each source image, y down. Boxes are [x0, y0, x1, y1] of the\n"
        "// cut-out PNGs; each eye's lids are a y per picture column x0, x0 + 1, ... x1.\n"
        f"export const STORY = {text} as const;\n"
    )
    print("stars:", len(meta["stars"]), "| wrote", OUT.relative_to(ROOT), "and", TS_OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
