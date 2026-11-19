import numpy as np
from PIL import Image
import time

print("Generating 4K White Bengal Tiger Base Color Texture...")
t0 = time.time()

# 1. Load original 4K lion base color (which has high-fidelity 4K baked fur, AO, eyes, mouth)
base_img = Image.open(r"tools\lion_base_color.png").convert("RGB")
w, h = base_img.size
arr = np.array(base_img, dtype=np.float32) / 255.0

# Extract Luminance / Grayscale detail: L = 0.299*R + 0.587*G + 0.114*B
L = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]

# Compute high-frequency fur detail texture (L normalized against local blur or high-pass)
# Detail keeps the high-resolution fur strands and wrinkles
fur_detail = L - 0.5

# 2. Build White Bengal Tiger Coat Base (creamy leucistic ivory-white with snow-white belly/underparts)
# Ground color: Ivory / Champagne white [0.88, 0.88, 0.89] with subtle pearl sheen
ground_r = np.clip(0.86 + 0.12 * L, 0.0, 1.0)
ground_g = np.clip(0.86 + 0.12 * L, 0.0, 1.0)
ground_b = np.clip(0.88 + 0.12 * L, 0.0, 1.0)

# 3. Procedural Bengal Tiger Stripe Synthesis across UV coordinates
# Create UV grid [0, 1]
u = np.linspace(0.0, 1.0, w, dtype=np.float32)
v = np.linspace(0.0, 1.0, h, dtype=np.float32)
U, V = np.meshgrid(u, v)

# Multi-octave organic tiger stripe pattern:
# Tiger stripes run vertically with organic branching, wave warps, and tapering
warp1 = np.sin(V * 18.0 + np.cos(U * 12.0) * 1.5) * 0.08
warp2 = np.cos(V * 32.0 + np.sin(U * 24.0) * 1.2) * 0.04
stripe_coord = (U + warp1 + warp2) * 36.0

# Main harmonic tiger stripe pulses
raw_stripes = np.sin(stripe_coord * np.pi * 2.0)
# Make stripes sharp with predatory taper: narrow dark bands with wide pale gaps
stripe_mask = np.clip((raw_stripes - 0.35) * 3.5, 0.0, 1.0)

# Modulate stripes by vertical position (denser on flanks, tapering on belly/back)
# And add secondary fine whisker/branching ripples
ripple = np.sin(U * 72.0 + V * 40.0) * np.cos(V * 60.0)
stripe_mask = np.clip(stripe_mask + ripple * 0.15, 0.0, 1.0)

# Preserve eyes, nose, and mouth cavities from the original masterwork texture!
# In the original texture, mouth/nostrils/eyes have specific color signatures:
# Eyes/pupils: very dark or golden; Nose/mouth: pink/dark
# We can identify face features by color thresholds:
is_eye = (arr[:, :, 0] > 0.6) & (arr[:, :, 1] > 0.4) & (arr[:, :, 2] < 0.25) & (L < 0.65)
is_pink_mouth = (arr[:, :, 0] > arr[:, :, 1] * 1.3) & (arr[:, :, 0] > arr[:, :, 2] * 1.3) & (arr[:, :, 0] > 0.4)
is_dark_cavity = L < 0.12

# Sepia / Charcoal Black stripe color with deep feline warmth
stripe_color_r = 0.11 * (0.6 + 0.4 * L)
stripe_color_g = 0.09 * (0.6 + 0.4 * L)
stripe_color_b = 0.09 * (0.6 + 0.4 * L)

# Blend ground coat with tiger stripes
tiger_r = ground_r * (1.0 - 0.88 * stripe_mask) + stripe_color_r * (0.88 * stripe_mask)
tiger_g = ground_g * (1.0 - 0.88 * stripe_mask) + stripe_color_g * (0.88 * stripe_mask)
tiger_b = ground_b * (1.0 - 0.88 * stripe_mask) + stripe_color_b * (0.88 * stripe_mask)

# 4. Ice-Blue Sapphire Eyes (Iconic White Bengal Tiger trait)
# White tigers are famous for their piercing sapphire-blue eyes with dark pupils
tiger_r[is_eye] = 0.22
tiger_g[is_eye] = 0.55
tiger_b[is_eye] = 0.92

# 5. Soft Pink Freckled Nose Leather & Muzzle
tiger_r[is_pink_mouth] = np.clip(arr[:, :, 0][is_pink_mouth] * 1.1, 0.0, 1.0)
tiger_g[is_pink_mouth] = np.clip(arr[:, :, 1][is_pink_mouth] * 0.85, 0.0, 1.0)
tiger_b[is_pink_mouth] = np.clip(arr[:, :, 2][is_pink_mouth] * 0.85, 0.0, 1.0)

# Retain dark cavities (claws, nostril slits, mouth inside)
tiger_r[is_dark_cavity] = arr[:, :, 0][is_dark_cavity]
tiger_g[is_dark_cavity] = arr[:, :, 1][is_dark_cavity]
tiger_b[is_dark_cavity] = arr[:, :, 2][is_dark_cavity]

# Assemble final 4K texture
tiger_rgb = np.stack([
    np.clip(tiger_r * 255.0, 0, 255).astype(np.uint8),
    np.clip(tiger_g * 255.0, 0, 255).astype(np.uint8),
    np.clip(tiger_b * 255.0, 0, 255).astype(np.uint8)
], axis=-1)

out_img = Image.fromarray(tiger_rgb, mode="RGB")
out_path = r"tools\white_tiger_base_color.png"
out_img.save(out_path, format="PNG")
print(f"White Bengal Tiger 4K texture generated in {time.time()-t0:.2f}s: {out_path}")
