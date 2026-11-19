import numpy as np
from PIL import Image
import time

print("Generating 4K Lioness Base Color Texture...")
t0 = time.time()

base_img = Image.open(r"tools\lion_base_color.png").convert("RGB")
w, h = base_img.size
arr = np.array(base_img, dtype=np.float32) / 255.0

L = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]

# Identify dark mane regions:
# Flank tawny color average:
flank_mask = (arr[:, :, 0] > 0.5) & (arr[:, :, 1] > 0.38) & (arr[:, :, 2] > 0.22) & (arr[:, :, 2] < 0.40)
tawny_r = np.median(arr[:, :, 0][flank_mask])
tawny_g = np.median(arr[:, :, 1][flank_mask])
tawny_b = np.median(arr[:, :, 2][flank_mask])
print(f"Sampled tawny flank color: R={tawny_r:.3f}, G={tawny_g:.3f}, B={tawny_b:.3f}")

# Dark mane hair pixels (dark brown/black hair cards that aren't eyes/mouth/claws)
is_dark_hair = (arr[:, :, 0] < 0.32) & (arr[:, :, 1] < 0.25) & (arr[:, :, 2] < 0.20) & (L > 0.05)

# Convert dark mane hair to tawny golden fur with subtle shading
lioness_r = arr[:, :, 0].copy()
lioness_g = arr[:, :, 1].copy()
lioness_b = arr[:, :, 2].copy()

# Blend dark mane to golden tawny
blend_factor = np.clip((0.32 - arr[:, :, 0]) / 0.25, 0.0, 1.0)
shading = np.clip(L / 0.30, 0.4, 1.2)

lioness_r[is_dark_hair] = np.clip(tawny_r * shading[is_dark_hair], 0.0, 1.0)
lioness_g[is_dark_hair] = np.clip(tawny_g * shading[is_dark_hair], 0.0, 1.0)
lioness_b[is_dark_hair] = np.clip(tawny_b * shading[is_dark_hair], 0.0, 1.0)

lioness_rgb = np.stack([
    np.clip(lioness_r * 255.0, 0, 255).astype(np.uint8),
    np.clip(lioness_g * 255.0, 0, 255).astype(np.uint8),
    np.clip(lioness_b * 255.0, 0, 255).astype(np.uint8)
], axis=-1)

out_img = Image.fromarray(lioness_rgb, mode="RGB")
out_path = r"tools\lioness_base_color.png"
out_img.save(out_path, format="PNG")
print(f"Lioness 4K texture generated in {time.time()-t0:.2f}s: {out_path}")
