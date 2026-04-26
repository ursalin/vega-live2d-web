import os
from PIL import Image

texture_dir = "/home/polaris/live2d_model/aolan/aolan.8192"

for filename in os.listdir(texture_dir):
    if filename.endswith(".png"):
        filepath = os.path.join(texture_dir, filename)
        with Image.open(filepath) as img:
            width, height = img.size
            if width > 4096 or height > 4096:
                print(f"Resizing {filename} from {width}x{height} to 4096x4096...")
                resized_img = img.resize((4096, 4096), Image.ANTIALIAS)
                resized_img.save(filepath)
                print(f"Saved {filename}")
            else:
                print(f"Skipping {filename}, size is {width}x{height}")
