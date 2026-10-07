import os
from PIL import Image, ImageDraw, ImageFont

os.makedirs('assets', exist_ok=True)

def create_icon(size):
    scale = 4
    img_size = size * scale
    
    # 1. Base gradient background
    image = Image.new('RGBA', (img_size, img_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    
    # Gradient: Modern Vibrant Blue to Violet (#2563EB -> #7C3AED)
    for y in range(img_size):
        ratio = y / img_size
        r = int(37 + (124 - 37) * ratio)
        g = int(99 + (58 - 99) * ratio)
        b = int(235 + (237 - 235) * ratio)
        draw.line([(0, y), (img_size, y)], fill=(r, g, b, 255))
        
    # Mask for rounded square
    corner_radius = int(img_size * 0.24)
    mask = Image.new('L', (img_size, img_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, img_size, img_size], radius=corner_radius, fill=255)
    
    rounded_bg = Image.new('RGBA', (img_size, img_size), (0, 0, 0, 0))
    rounded_bg.paste(image, (0, 0), mask)
    draw = ImageDraw.Draw(rounded_bg)
    
    # Sleek inner border
    border_width = max(1, int(img_size * 0.025))
    draw.rounded_rectangle(
        [border_width, border_width, img_size - border_width, img_size - border_width],
        radius=corner_radius,
        outline=(255, 255, 255, 80),
        width=border_width
    )
    
    # Load fonts
    font_en_path = "/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf"
    font_bn_path = "/usr/share/fonts/google-noto-vf/NotoSansBengali[wght].ttf"
    
    card_radius = int(img_size * 0.10)
    
    # Card 1: Top-Left (English "A")
    c1_x1, c1_y1 = int(img_size * 0.12), int(img_size * 0.14)
    c1_x2, c1_y2 = int(img_size * 0.60), int(img_size * 0.58)
    # Card shadow
    draw.rounded_rectangle([c1_x1 + 4, c1_y1 + 6, c1_x2 + 4, c1_y2 + 6], radius=card_radius, fill=(0, 0, 0, 50))
    # Card body
    draw.rounded_rectangle([c1_x1, c1_y1, c1_x2, c1_y2], radius=card_radius, fill=(255, 255, 255, 245))
    
    # Card 2: Bottom-Right (Bengali "অ")
    c2_x1, c2_y1 = int(img_size * 0.40), int(img_size * 0.42)
    c2_x2, c2_y2 = int(img_size * 0.88), int(img_size * 0.86)
    # Card shadow
    draw.rounded_rectangle([c2_x1 + 4, c2_y1 + 6, c2_x2 + 4, c2_y2 + 6], radius=card_radius, fill=(0, 0, 0, 60))
    # Card body: warm amber/emerald or bright white-gold
    draw.rounded_rectangle([c2_x1, c2_y1, c2_x2, c2_y2], radius=card_radius, fill=(254, 240, 138, 250))
    
    # Subtle border on cards
    draw.rounded_rectangle([c1_x1, c1_y1, c1_x2, c1_y2], radius=card_radius, outline=(255, 255, 255, 200), width=max(1, int(img_size * 0.01)))
    draw.rounded_rectangle([c2_x1, c2_y1, c2_x2, c2_y2], radius=card_radius, outline=(253, 224, 71, 200), width=max(1, int(img_size * 0.01)))

    # Draw "A"
    try:
        font_en = ImageFont.truetype(font_en_path, int(img_size * 0.30))
        # Center text in Card 1
        bbox_a = font_en.getbbox("A")
        w_a = bbox_a[2] - bbox_a[0]
        h_a = bbox_a[3] - bbox_a[1]
        x_a = c1_x1 + (c1_x2 - c1_x1 - w_a) // 2 - bbox_a[0]
        y_a = c1_y1 + (c1_y2 - c1_y1 - h_a) // 2 - bbox_a[1]
        draw.text((x_a, y_a), "A", fill=(30, 41, 59, 255), font=font_en)
    except Exception as e:
        print("Font A error:", e)

    # Draw "অ"
    try:
        font_bn = ImageFont.truetype(font_bn_path, int(img_size * 0.30))
        # Center text in Card 2
        bbox_bn = font_bn.getbbox("অ")
        w_bn = bbox_bn[2] - bbox_bn[0]
        h_bn = bbox_bn[3] - bbox_bn[1]
        x_bn = c2_x1 + (c2_x2 - c2_x1 - w_bn) // 2 - bbox_bn[0]
        y_bn = c2_y1 + (c2_y2 - c2_y1 - h_bn) // 2 - bbox_bn[1]
        draw.text((x_bn, y_bn), "অ", fill=(146, 64, 14, 255), font=font_bn)
    except Exception as e:
        print("Font BN error:", e)

    # Downsample
    final_img = rounded_bg.resize((size, size), Image.Resampling.LANCZOS)
    final_img.save(f'assets/icon{size}.png', 'PNG')
    print(f'Generated assets/icon{size}.png ({size}x{size})')

for s in [16, 48, 128]:
    create_icon(s)
