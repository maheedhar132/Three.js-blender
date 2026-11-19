import struct, json, io, os
from PIL import Image

def optimize_glb(input_path, output_path, jpeg_quality=95):
    print(f"Reading {input_path}...")
    with open(input_path, 'rb') as f:
        data = f.read()

    magic, ver, total_len = struct.unpack('<III', data[:12])
    json_len, json_type = struct.unpack('<II', data[12:20])
    gltf = json.loads(data[20:20+json_len].decode('utf-8'))
    bin_header_offset = 20 + json_len
    bin_len, bin_type = struct.unpack('<II', data[bin_header_offset:bin_header_offset+8])
    bin_data = data[bin_header_offset+8 : bin_header_offset+8+bin_len]

    # Find all bufferViews used by images
    img_bvs = set()
    for img in gltf.get('images', []):
        if 'bufferView' in img:
            img_bvs.add(img['bufferView'])

    new_bin = bytearray()
    new_bvs = []

    for idx, bv in enumerate(gltf['bufferViews']):
        old_offset = bv.get('byteOffset', 0)
        old_length = bv['byteLength']
        chunk = bin_data[old_offset : old_offset + old_length]

        if idx in img_bvs:
            img_entry = next(im for im in gltf['images'] if im.get('bufferView') == idx)
            try:
                im = Image.open(io.BytesIO(chunk))
                if im.mode != 'RGB':
                    im = im.convert('RGB')
                out_io = io.BytesIO()
                im.save(out_io, format='JPEG', quality=jpeg_quality)
                compressed = out_io.getvalue()
                print(f"Compressed {img_entry.get('name')}: {len(chunk)/1024/1024:.2f}MB -> {len(compressed)/1024/1024:.2f}MB")
                chunk = compressed
                img_entry['mimeType'] = 'image/jpeg'
            except Exception as e:
                print(f"Error compressing image: {e}")

        # 4-byte align
        pad = (4 - (len(new_bin) % 4)) % 4
        new_bin.extend(b'\x00' * pad)

        new_offset = len(new_bin)
        new_length = len(chunk)
        new_bin.extend(chunk)

        new_bv = dict(bv)
        new_bv['byteOffset'] = new_offset
        new_bv['byteLength'] = new_length
        new_bvs.append(new_bv)

    gltf['bufferViews'] = new_bvs
    gltf['buffers'][0]['byteLength'] = len(new_bin)

    json_bytes = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    json_bytes += b' ' * json_pad

    bin_pad = (4 - (len(new_bin) % 4)) % 4
    new_bin.extend(b'\x00' * bin_pad)

    total_len = 12 + 8 + len(json_bytes) + 8 + len(new_bin)
    header = struct.pack('<III', magic, ver, total_len)
    json_header = struct.pack('<II', len(json_bytes), 0x4E4F534A)
    bin_header = struct.pack('<II', len(new_bin), 0x004E4942)

    with open(output_path, 'wb') as f:
        f.write(header)
        f.write(json_header)
        f.write(json_bytes)
        f.write(bin_header)
        f.write(new_bin)

    print(f"Saved {output_path} ({len(data)/1024/1024:.2f}MB -> {total_len/1024/1024:.2f}MB)")

if __name__ == '__main__':
    in_glb = os.path.join(r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo", "Lion-Male-Rigged.glb")
    out_glb = os.path.join(r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo", "Lion-Male-Rigged.web.glb")
    optimize_glb(in_glb, out_glb)
