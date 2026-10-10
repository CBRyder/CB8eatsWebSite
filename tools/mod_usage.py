#!/usr/bin/env python3
"""The community mod tally behind the "Most used by the Community" filter on warframe.html.

tools/mod-usage.json holds one record per build that has been read, and who made it:

    { "updated": "2026-10-09", "about": "...",
      "names":  { "696": "Vigilante Armaments", ... },          # Overframe mod id -> name
      "builds": { "overframe:553": { "by": "mmosimca", "cat": "primary-weapons", "mods": [696, 710, ...] },
                  "ingame:banshee-config-c": { "by": "cb8eats", "cat": "warframes", "mods": ["Pressure Point", ...] } } }

A build key is "<source>:<id>", so the same build can never be counted twice. A mod in a build is
either a number (looked up in `names`) or a plain name. The popularity of a mod is how many DIFFERENT
players use it (the `by` field, ignoring case), not how many builds: one player can post dozens of
near-identical builds, and they count once. The number of builds is kept too, for reference.

    python3 tools/mod_usage.py add --source ingame --id banshee-config-c --by cb8eats \
        --cat warframes --mods "Rolling Guard, Primed Flow, ..."     # tally a build you just read
    python3 tools/mod_usage.py report                                 # totals, top mods, top authors

tools/build-mod-stats.py imports counts() from here and writes the numbers into warframe-mod-stats.json.
Run it again after adding builds, and commit both files.
"""
import argparse, collections, datetime, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PATH = os.path.join(HERE, 'mod-usage.json')
CATEGORIES = ['warframes', 'primary-weapons', 'secondary-weapons', 'melee-weapons', 'archwing', 'companions']
COMMUNITY_SHARE = 0.03   # a mod is "most used" when at least this share of the players use it...
COMMUNITY_FLOOR = 3      # ...and never fewer than this many different players


def load(path=DEFAULT_PATH):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save(data, path=DEFAULT_PATH):
    """One line per name and per build, so a git diff shows exactly which builds were added."""
    data['updated'] = datetime.date.today().isoformat()
    with open(path, 'w', encoding='utf-8') as f:
        f.write('{\n')
        f.write('"updated": %s,\n' % json.dumps(data['updated']))
        f.write('"about": %s,\n' % json.dumps(data.get('about', ''), ensure_ascii=False))
        f.write('"names": {\n')
        items = sorted(data.get('names', {}).items(), key=lambda kv: int(kv[0]))
        f.write(',\n'.join('%s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False)) for k, v in items))
        f.write('\n},\n"builds": {\n')
        f.write(',\n'.join('%s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False, separators=(',', ':')))
                           for k, v in data['builds'].items()))
        f.write('\n}\n}\n')


def mod_names(data, build):
    """The names of the mods in one build (numbers are looked up in `names`)."""
    names = data.get('names', {})
    out = []
    for m in build['mods']:
        n = names.get(str(m)) if isinstance(m, int) else m
        if not n:
            raise ValueError('mod id %s has no name in "names"' % m)
        out.append(n)
    return out


def counts(data):
    """-> (players_total, builds_total, { lower-case mod name: {name, players, builds} })"""
    players, per = set(), {}
    for build in data['builds'].values():
        who = build['by'].strip().lower()
        players.add(who)
        for n in set(mod_names(data, build)):
            e = per.setdefault(n.lower(), {'name': n, 'players': set(), 'builds': 0})
            e['players'].add(who)
            e['builds'] += 1
    for e in per.values():
        e['players'] = len(e['players'])
    return len(players), len(data['builds']), per


def min_players(players_total):
    """How many different players a mod needs to count as "most used by the community"."""
    return max(COMMUNITY_FLOOR, math.ceil(COMMUNITY_SHARE * players_total))


def cmd_add(args):
    data = load(args.file)
    key = '%s:%s' % (args.source, args.id)
    if key in data['builds'] and not args.replace:
        sys.exit('%s is already in the tally (use --replace to overwrite it).' % key)
    known = {}
    for b in data['builds'].values():
        for n in mod_names(data, b):
            known.setdefault(n.lower(), n)
    if args.items:
        for m in json.load(open(args.items, encoding='utf-8')):
            known.setdefault(m['name'].lower(), m['name'])
    mods, new = [], []
    for raw in re.split(r'\s*,\s*', args.mods.strip()):
        raw = re.sub(r'\s+', ' ', raw).strip()
        if not raw:
            continue
        canon = known.get(raw.lower())
        if canon is None:
            new.append(raw)
            canon = raw
        if canon not in mods:
            mods.append(canon)
    if not mods:
        sys.exit('No mods given.')
    data['builds'][key] = {'by': args.by.strip(), 'cat': args.cat, 'mods': mods}
    save(data, args.file)
    print('Tallied %s by %s: %d mods.' % (key, args.by, len(mods)))
    if new:
        print('Names not seen before (check the spelling): ' + ', '.join(new))
    print('Now run: python3 tools/build-mod-stats.py --items <Mods.json>')


def cmd_report(args):
    data = load(args.file)
    players, builds, per = counts(data)
    need = min_players(players)
    print('%d builds by %d different players. Most used = at least %d players.' % (builds, players, need))
    by_cat = collections.Counter(b['cat'] for b in data['builds'].values())
    print('Builds per category: ' + ', '.join('%s %d' % kv for kv in sorted(by_cat.items())))
    who = collections.Counter(b['by'].strip().lower() for b in data['builds'].values())
    print('Most builds by one player: ' + ', '.join('%s %d' % kv for kv in who.most_common(5)))
    ranked = sorted(per.values(), key=lambda e: (-e['players'], -e['builds'], e['name']))
    print('%d of %d mods reach the bar. Top %d:' % (sum(1 for e in ranked if e['players'] >= need), len(ranked), args.top))
    for e in ranked[:args.top]:
        print('  %3d players  %3d builds  %s' % (e['players'], e['builds'], e['name']))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--file', default=DEFAULT_PATH)
    sub = ap.add_subparsers(dest='cmd', required=True)
    a = sub.add_parser('add', help='tally one build')
    a.add_argument('--source', required=True, help='where it was read, e.g. overframe or ingame')
    a.add_argument('--id', required=True, help='the build id at that source (any short unique text)')
    a.add_argument('--by', required=True, help="the player who made the build")
    a.add_argument('--cat', required=True, choices=CATEGORIES)
    a.add_argument('--mods', required=True, help='comma-separated mod names')
    a.add_argument('--items', help='warframe-items Mods.json, to catch misspelt names')
    a.add_argument('--replace', action='store_true')
    a.set_defaults(fn=cmd_add)
    r = sub.add_parser('report', help='totals, top mods and top authors')
    r.add_argument('--top', type=int, default=25)
    r.set_defaults(fn=cmd_report)
    args = ap.parse_args()
    args.fn(args)
