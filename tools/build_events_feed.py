"""Builds events-feed.js: the events Time Memoria's Active Events shows, for
Today > Events and the rail rotator, plus the next All Worlds maintenance, for
the maintenance countdown and lockout. Run every hour by
.github/workflows/events-feed.yml, a few minutes after ffxiv-latest-news
refreshes LatestNews.json.

Source: LegendsOfTheGame/ffxiv-latest-news, LatestNews.json. One feed for the
plugin and the Ledger, so the two cannot disagree. Times are UTC Unix seconds.
An event can carry "endNote" ("Until Patch 8.0") and "endEstimated" (the end is
a reported patch date, not a confirmed one); both are passed through.

The page loads this repo's file. One exception: the maintenance lockout's
"Check again" (maintenance.js) reads LatestNews.json directly, to see an
extension without waiting for this job.
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
MAINT_KEEP = ("title", "start", "end", "url")


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

    # The next (or current) All Worlds maintenance, for the page's countdown and its
    # lockout screen. None when the feed has no maintenance with both times.
    m = feed.get("maintenance")
    maintenance = (
        {k: m[k] for k in MAINT_KEEP if k in m}
        if isinstance(m, dict) and isinstance(m.get("start"), int) and isinstance(m.get("end"), int)
        else None
    )

    # Compare the parsed event lists. A text search for the new JSON in the old file
    # matched an empty list ("[]") against almost any file, so a feed with no events
    # was never written and ended events stayed on the site.
    try:
        with open(OUTPUT, encoding="utf-8") as f:
            old = f.read()
        start = old.find("{", old.find("const EVENTS_FEED"))
        end = old.rfind("}")
        if start >= 0 and end > start:
            parsed = json.loads(old[start:end + 1])
            if parsed.get("events") == events and parsed.get("maintenance") == maintenance:
                print("No change.")
                return
    except (FileNotFoundError, ValueError):
        pass

    built = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    body = json.dumps({"built": built, "events": events, "maintenance": maintenance}, ensure_ascii=False)
    with open(OUTPUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("// Built by tools/build_events_feed.py from ffxiv-latest-news. Do not edit by hand.\n")
        f.write(f"const EVENTS_FEED = {body};\n")
    print(f"Wrote {OUTPUT}: {len(events)} event(s), maintenance {'yes' if maintenance else 'none'}.")


if __name__ == "__main__":
    main()
