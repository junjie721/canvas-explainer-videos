#!/usr/bin/env python3
# 用真实的 tokenizer 验证切分与 ID（写这段是为了让视频里的数字有出处，而不是我编的）
# 输出两份：控制台可读报告 + tokenization.json（UTF-8，供视频脚本引用）
import json
import pathlib

import tiktoken

TEXTS = [
    "你好，世界！",
    "你好",
    "世界",
    "！",
    "tokenization",
    "ChatGPT",
    "Hello, world!",
]
ENCODINGS = ["cl100k_base", "o200k_base"]
dump = {}

for name in ENCODINGS:
    enc = tiktoken.get_encoding(name)
    dump[name] = {"vocab": enc.n_vocab, "strings": {}}
    print(f"########## {name}  (vocab={enc.n_vocab}) ##########")
    for text in TEXTS:
        ids = enc.encode(text)
        pieces = []
        for i in ids:
            b = enc.decode_single_token_bytes(i)
            pieces.append(b.decode("utf-8", "backslashreplace"))   # 无法独立成字的字节块会显示成 \\xe4 这种形式
        dump[name]["strings"][text] = {"ids": ids, "count": len(ids), "pieces": pieces}
        print(f"  {text!r:22} -> {len(ids)} token(s)")
        print(f"      ids     = {ids}")
        print(f"      pieces  = {pieces}")
    print()

out = pathlib.Path(__file__).with_name("tokenization.json")
out.write_text(json.dumps(dump, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"written: {out}")
