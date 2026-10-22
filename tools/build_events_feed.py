"""Builds events-feed.js: the events Time Memoria's Active Events shows, for
Today > Events and the rail rotator. Run every 6 hours by
.github/workflows/events-feed.yml, a few minutes after ffxiv-latest-news
refreshes LatestNews.json.

Source: LegendsOfTheGame/ffxiv-latest-news, LatestNews.json. One feed for the
plugin and the Ledger, so the two cannot disagree. Times are UTC Unix seconds.
An event can carry "endNote" ("Until Patch 8.0") and "endEstimated" (the end is
a reported patch date, not a confirmed one); both are passed through.

The page never calls the feed itself: visitors only ever load this repo's file.
The file is rewritten only when the events change, so a quiet run makes no
commit. A failed fetch exits non-zero and leaves the last good file in place.

Usage: python tools/build_events_feed.py [output path]
"""
import datetime
import json
import sys
import urllib.request

OUTPUT = sys.argv[1] if len(sys.argv) > 1 else "events-feed.js"
FEED = "https://raw.githubusercontent.com/LegendsOfTheGame/ffxiv-latest-news/main/LatestNews.json"
AGENT = "LegendMemoria-Ledger/1.0 (+https://legendmemoria.org)"
KEEP = ("title", "start", "end", "url", "category", "endNote", "endEstimated")


def main() -> None:
    request = urllib.request.Request(FEED, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        feed = json.load(response)

    events = [
        {k: e[k] for k in KEEP if k in e}
        for e in feed.get("events", [])
        if isinstance(e.get("start"), int) and e.get("title")
    ]
    events.sort(key=lambda e: e["start"])

    try:
        with open(OUTPUT, encoding="utf-8") as f:
            old = f.read()
        if json.dumps(events, ensure_ascii=False) in old:
            print("No change.")
            return
    except FileNotFoundError:
        pass

    built = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    body = json.dumps(events, ensure_ascii=False)
    with open(OUTPUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("// Built by tools/build_events_feed.py from ffxiv-latest-news. Do not edit by hand.\n")
        f.write(f"const EVENTS_FEED = {{\"built\": \"{built}\", \"events\": {body}}};\n")
    print(f"Wrote {OUTPUT}: {len(events)} event(s).")


if __name__ == "__main__":
    main()
