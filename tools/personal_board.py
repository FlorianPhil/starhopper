"""Bundle a private pad pack, playback code and soundtracks into a local HTML file."""
import argparse
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def data_uri(path, kind):
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{kind};base64,{encoded}"


def script_value(value):
    return json.dumps(value, ensure_ascii=True).replace("<", r"\u003c")


def build(pack, output, emergency):
    if output.resolve().is_relative_to(ROOT):
        raise ValueError("Choose an output outside the public site.")
    music = {mode: data_uri(ROOT / f"audio/mix/{mode}-glide.mp3", "audio/mpeg")
             for mode in ("combat", "cruise", "stealth", "warp")}
    music["emergency"] = data_uri(emergency or ROOT / "audio/mix/combat-overdrive.mp3", "audio/mpeg")
    html = (ROOT / "index.html").read_text()
    html = re.sub(r'<link rel="manifest"[^>]*>', "", html)
    html = html.replace("img/icon.svg", data_uri(ROOT / "img/icon.svg", "image/svg+xml"))
    html = re.sub(r'<link rel="stylesheet"[^>]*>', lambda _: "<style>" +
                  (ROOT / "css/cockpit.css").read_text() + "</style>", html)
    scripts = re.findall(r'<script defer src="([^"]+)"></script>', html)
    html = re.sub(r'<script defer src="[^"]+"></script>', "", html)
    pack_data = json.loads(pack.read_text())
    boot = f"window.tripPack={script_value(pack_data)};window.tripMusic={script_value(music)};"
    code = "\n".join((ROOT / path).read_text() for path in scripts)
    html = html.replace("</body>", "<script>" + boot + "\n" + code + "</script></body>")
    html = re.sub(r'Save the deck on this phone while online\..*?</p>',
                  "The music and sound pack travel with this file.</p>", html, count=1, flags=re.S)
    if emergency:
        html = html.replace("Emergency uses the Combat overdrive mix.", "Your personal Emergency soundtrack is included.")
    output.write_text(html)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pack", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--emergency", type=Path)
    args = parser.parse_args()
    build(args.pack, args.output, args.emergency)
