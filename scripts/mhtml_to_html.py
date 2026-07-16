#!/usr/bin/env python3
"""Convert a Chrome "Saved by Blink" .mhtml archive into a single self-contained
.html file by inlining every referenced resource (CSS, images, fonts, JS) as a
data: URI. CSS parts are processed recursively so their url(...) references also
become data URIs, so the result renders identically to the archived page.
"""
import base64
import email
import re
import sys
from email import policy


def strip_cid(value: str) -> str:
    return value.strip().lstrip("<").rstrip(">")


def to_data_uri(content_type: str, raw: bytes) -> str:
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{content_type};base64,{b64}"


def main(src: str, dst: str) -> None:
    with open(src, "rb") as f:
        msg = email.message_from_binary_file(f, policy=policy.default)

    parts = []
    for part in msg.walk():
        if part.is_multipart():
            continue
        ctype = part.get_content_type()
        cid = part.get("Content-ID")
        cloc = part.get("Content-Location")
        payload = part.get_payload(decode=True)
        if payload is None:
            continue
        parts.append({
            "ctype": ctype,
            "cid": strip_cid(cid) if cid else None,
            "cloc": cloc.strip() if cloc else None,
            "payload": payload,
        })

    # The main document is the first text/html part.
    html_part = next((p for p in parts if p["ctype"] == "text/html"), None)
    if html_part is None:
        raise SystemExit("No text/html part found in MHTML")

    by_cid = {p["cid"]: p for p in parts if p["cid"]}
    by_cloc = {p["cloc"]: p for p in parts if p["cloc"]}

    # Resolve a reference (cid: or content-location URL) to a data URI, or None.
    def resolve(ref: str):
        ref = ref.strip().strip('"').strip("'")
        if ref.startswith("data:"):
            return ref
        # Parts may be keyed by Content-Location (including "cid:..." values) or
        # by a bare Content-ID. Try the location map first, then the id map.
        target = by_cloc.get(ref)
        if target is None and ref.startswith("cid:"):
            target = by_cid.get(ref[4:])
        if target is None:
            return None
        content = target["payload"]
        if target["ctype"] == "text/css":
            content = inline_css(content.decode("utf-8", "replace")).encode("utf-8")
        return to_data_uri(target["ctype"], content)

    url_re = re.compile(r"url\(\s*([^)]+?)\s*\)")

    def inline_css(css: str) -> str:
        def repl(m):
            raw = m.group(1).strip().strip('"').strip("'")
            data = resolve(raw)
            return f"url({data})" if data else m.group(0)
        return url_re.sub(repl, css)

    html = html_part["payload"].decode("utf-8", "replace")

    # Replace href/src attributes that point at cid: or archived URLs.
    attr_re = re.compile(r'(href|src)\s*=\s*"([^"]*)"', re.IGNORECASE)

    def attr_repl(m):
        attr, ref = m.group(1), m.group(2)
        if ref.startswith("cid:") or ref in by_cloc:
            data = resolve(ref)
            if data:
                return f'{attr}="{data}"'
        return m.group(0)

    html = attr_re.sub(attr_repl, html)
    # Inline any url(...) references that live in inline style blocks/attributes.
    html = url_re.sub(
        lambda m: (lambda d: f"url({d})" if d else m.group(0))(
            resolve(m.group(1))
        ),
        html,
    )

    with open(dst, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Wrote {dst} ({len(html)} chars) from {len(parts)} MHTML parts")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
