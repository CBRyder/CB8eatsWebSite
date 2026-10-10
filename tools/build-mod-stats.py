#!/usr/bin/env python3
"""Build warframe-mod-stats.json, the data behind the "View mod" screen on warframe.html.

Run from the repo root whenever the mod lists in warframe-data.json change:

    python3 tools/build-mod-stats.py --items /path/to/Mods.json

Mods.json is WFCD's warframe-items database (npm package `warframe-items`, file
data/json/Mods.json, or https://github.com/WFCD/warframe-items). The script reads every
mod name on the Mods tab (owned and missing groups) and the mods in the saved builds,
finds each one in that database, and writes a compact file with the stats at every rank.

It also reads warframe-community-builds.json (the community builds on the Builds tab, whose mod chips use
group id `community`) and the community tally (tools/mod-usage.json, see tools/mod_usage.py) and writes how many
different players use each mod into the mod's `u` field, so the Mods tab can offer "Most used by the
Community". Run this again after tallying more builds.

Output shape (see CLAUDE.md, "View mod screen"):
  { built, source, usage: { players, builds, min, label, updated },
    mods: { "<key>": { n, p, r, d, m, c, t, l, xr, ds, set, sp, tr, ex, intro, w, img, u } },
    index: { "<groupId>|<chip name>": ["<key>", ...] },
    partial: { "<groupId>|<chip name>": ["<name not found>", ...] } }
`u` is [different players using the mod, builds using it]; a mod nobody in the tally uses has no `u`.
A chip that stands for a whole family (for example "Bane of Corpus/Grineer/Infested") points
at several keys; `partial` lists the family members the database does not have. Chips with no match are simply not in `index`, and the page leaves them
as plain, untappable chips.

The script prints every chip it could not match and every pick that was a judgement call,
so look at that list after a run.
"""
import argparse, collections, datetime, json, os, re, sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mod_usage

ap = argparse.ArgumentParser()
ap.add_argument('--items', required=True, help='path to warframe-items Mods.json')
ap.add_argument('--data', default='warframe-data.json')
ap.add_argument('--out', default='warframe-mod-stats.json')
ap.add_argument('--usage', default=mod_usage.DEFAULT_PATH, help='the community tally')
ap.add_argument('--community', default='warframe-community-builds.json', help='the community builds shown on the Builds tab')
args = ap.parse_args()

mods = json.load(open(args.items, encoding='utf-8'))
data = json.load(open(args.data, encoding='utf-8'))
usage = mod_usage.load(args.usage)
players_total, builds_total, per_mod = mod_usage.counts(usage)

# --- which kinds of mod a group of chips is most likely to hold (used to break ties) ---
WARFRAME = ['Warframe Mod']
PREF = {
    'wf-good': WARFRAME, 'wf-part': WARFRAME, 'wf-raw': WARFRAME, 'auras': WARFRAME, 'augments': WARFRAME,
    'melee': ['Melee Mod'], 'thrown': ['Melee Mod'], 'stances': ['Stance Mod', 'Posture Mod'],
    'rifle': ['Primary Mod'], 'shotgun': ['Shotgun Mod'], 'pistol': ['Secondary Mod'],
    'companion': ['Companion Mod'], 'sentinel': ['Companion Mod'], 'beast': ['Companion Mod'],
    'necramech': ['Necramech Mod'], 'archwing': ['Archwing Mod', 'Arch-Gun Mod', 'Arch-Melee Mod'],
    'parazon': ['Parazon Mod', 'Warframe Mod'], 'railjack': ['Railjack Mod', 'Plexus Mod'],
    'm-top': WARFRAME, 'm-other': WARFRAME, 'm-exilus': WARFRAME, 'm-aura': WARFRAME,
    'm-rifle': ['Primary Mod'], 'm-shotgun': ['Shotgun Mod'], 'm-pistol': ['Secondary Mod'],
    'm-melee': ['Melee Mod'], 'm-companion': ['Companion Mod', 'Necramech Mod'],
    'm-arch': ['Arch-Gun Mod', 'Parazon Mod', 'Arch-Melee Mod'], 'm-stance': ['Stance Mod'],
}
# Prefixes in front of a name on the page that tell us the kind of mod.
PREFIX_TYPE = {'Focus Way': 'Focus Way', 'Posture': 'Posture Mod', 'Amp': 'Tektolyst Artifact Mod'}
STANCE_WORD = re.compile(r'^[A-Za-z][A-Za-z ]*: ')   # "Fists: Fracturing Wind"
TIER_DIRS = ('/Beginner/', '/Intermediate/', '/Expert/')

by_name = collections.defaultdict(list)
for m in mods:
    by_name[m['name'].lower()].append(m)


def chip_name(s):
    """Same reading of a chip as parseChip() in warframe.html, name only."""
    if isinstance(s, dict):
        s = s['t']
    s = re.sub(r'\(r\d+/\d+\)', '', s)
    s = re.sub(r'\sx\d+\b', '', s)
    s = s.replace('*', '')
    s = re.sub(r'\([^)]*\)', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def expand(name):
    """One chip name -> list of (database name, forced type or None)."""
    m = re.match(r'^Bond family: (.+)$', name)
    if m:
        return [(x + ' Bond', None) for x in m.group(1).split('/')]
    m = re.match(r'^Requiem set: (.+)$', name)
    if m:
        return [(x, 'Parazon Mod') for x in m.group(1).split('/')]
    if '/' in name:
        parts = name.split('/')
        words = parts[0].split(' ')
        prefix = ' '.join(words[:-1]) + (' ' if len(words) > 1 else '')
        first = words[-1]
        return [((prefix + p) if i else (prefix + first), None) for i, p in enumerate(parts)] \
            if len(words) > 1 else [(p, None) for p in parts]
    m = re.match(r'^(%s): (.+)$' % '|'.join(PREFIX_TYPE), name)
    if m:
        return [(m.group(2), PREFIX_TYPE[m.group(1)])]
    if STANCE_WORD.match(name):
        return [(name.split(': ', 1)[1], 'Stance Mod')]
    return [(name, None)]


calls = []   # judgement calls to print


def pick(db_name, group_id, forced_type=None):
    cands = by_name.get(db_name.lower())
    if not cands:
        return None
    prefer = [forced_type] if forced_type else PREF.get(group_id, [])
    if forced_type:
        typed = [c for c in cands if c['type'] == forced_type]
        cands = typed or cands

    def score(c):
        plain = not any(t in c['uniqueName'] for t in TIER_DIRS)
        real = '|' not in json.dumps(c.get('levelStats') or [])   # a few duplicates only hold |PLACEHOLDER| text
        return (c['type'] in prefer, plain, real, c.get('fusionLimit') or 0)
    ranked = sorted(cands, key=score, reverse=True)
    if len(ranked) > 1 and score(ranked[0]) == score(ranked[1]) and ranked[0]['uniqueName'] != ranked[1]['uniqueName']:
        calls.append('%s (%s): %d equally good matches, took %s' % (db_name, group_id, len(cands), ranked[0]['uniqueName'].split('/')[-1]))
    return ranked[0]


# --- cleaning the in-game text ---
def clean(s):
    s = s.replace('<LINE_SEPARATOR>', '\n')
    s = re.sub(r'<ACTIVATE_ABILITY_(\d)>', r'[\1]', s)
    s = s.replace('<USE>', '[Use]').replace('<SECONDARY_FIRE>', '[Alt fire]')
    s = re.sub(r'(\d)\s*<ENERGY>', r'\1 Energy', s).replace('<ENERGY>', 'Energy')
    s = re.sub(r'\|([A-Z_]+)\|', lambda m: '[' + m.group(1).lower().replace('armour', 'armor') + ']', s)
    s = re.sub(r'<[^>]*>', '', s)
    s = s.replace('\\n', '\n')
    s = re.sub(r'Energy\s+Energy', 'Energy', s)
    return [ln.strip() for ln in s.split('\n') if ln.strip()]


def levels(m):
    out = []
    for ls in (m.get('levelStats') or []):
        lines = []
        for st in ls.get('stats', []):
            lines += clean(st)
        out.append(lines)
    return out if any(out) else []


def set_name(path):
    mm = re.search(r'/Sets/([^/]+)/', path or '')
    return mm.group(1) if mm else None


sets = collections.defaultdict(list)
for m in mods:
    if m.get('modSet'):
        sets[m['modSet']].append(m['name'])

store, key_of = {}, {}


def record(m):
    uid = m['uniqueName']
    if uid in key_of:
        return key_of[uid]
    key = 'm%d' % len(store)
    key_of[uid] = key
    compat = m.get('compatName')
    if compat and compat.isupper():
        compat = compat.capitalize()
    rec = {'n': m['name'], 'p': m.get('polarity'), 'r': m.get('rarity'), 'd': m.get('baseDrain'),
           'm': m.get('fusionLimit'), 'c': compat, 't': m.get('type')}
    lv = levels(m)
    limit = m.get('fusionLimit')
    if lv and isinstance(limit, int) and len(lv) > limit + 1:
        # a few Railjack mods list more levels than their max rank; the normal max rank is what the game shows
        rec['xr'] = len(lv) - (limit + 1)
        lv = lv[:limit + 1]
    if lv:
        rec['l'] = lv
    if m.get('description'):
        rec['ds'] = ' '.join(clean(m['description']))
    sn = set_name(m.get('modSet'))
    if sn:
        rec['set'] = sn
        partners = sorted(set(sets[m['modSet']]) - {m['name']})
        if partners:
            rec['sp'] = partners
    use = per_mod.get(m['name'].lower())
    if use:
        rec['u'] = [use['players'], use['builds']]
    if m.get('tradable') is not None:
        rec['tr'] = bool(m['tradable'])
    if m.get('isExilus'):
        rec['ex'] = 1
    if m.get('introduced', {}).get('name') and m['introduced']['name'] != 'Vanilla':
        rec['intro'] = m['introduced']['name']
    if m.get('wikiaUrl'):
        rec['w'] = m['wikiaUrl']
    if m.get('imageName'):
        rec['img'] = m['imageName']
    store[key] = rec
    return key


index, partial, unmatched, total = {}, {}, [], 0
listed = set()   # names of mods on the Owned, Missing and saved-build lists (not the community builds)


def add(group_id, name):
    global total
    total += 1
    keys, missing = [], []
    for db_name, forced in expand(name):
        m = pick(db_name, group_id, forced)
        if m:
            if group_id != 'community':
                listed.add(m['name'].lower())
            k = record(m)
            if k not in keys:
                keys.append(k)
        else:
            missing.append(db_name)
    if keys:
        index[group_id + '|' + name] = keys
        if missing:
            partial[group_id + '|' + name] = missing
    else:
        unmatched.append((group_id, name))


for view in ('owned', 'missing'):
    for g in data['mods'][view]:
        for it in g['items']:
            add(g['id'], chip_name(it))
for b in data.get('builds', []):
    for md in b.get('mods', []):
        add('builds', md[0])
if os.path.exists(args.community):          # the community builds on the Builds tab; their chips use group id "community"
    for b in json.load(open(args.community, encoding='utf-8'))['builds']:
        for md in b['mods']:
            add('community', md[0])

need = mod_usage.min_players(players_total)
out = {'built': datetime.date.today().isoformat(),
       'source': 'WFCD warframe-items Mods.json',
       'usage': {'players': players_total, 'builds': builds_total, 'min': need,
                 'label': "Overframe's top builds", 'updated': usage.get('updated')},
       'mods': store, 'index': index, 'partial': partial}
with open(args.out, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))

print('chips read: %d, matched: %d, mods written: %d' % (total, total - len(unmatched), len(store)))
print('NOT MATCHED (%d):' % len(unmatched))
for g, n in unmatched:
    print('  %-10s %s' % (g, n))
print('FAMILIES WITH SOME NAMES MISSING (%d):' % len(partial))
for k, v in partial.items():
    print('  %s -> missing %s' % (k, ', '.join(v)))
print('JUDGEMENT CALLS (%d):' % len(calls))
for c in calls:
    print('  ' + c)

# --- the community tally against the lists on the page ---
popular = sorted((e for e in per_mod.values() if e['players'] >= need), key=lambda e: (-e['players'], e['name']))
shown = [e for e in popular if e['name'].lower() in listed]
elsewhere = [e for e in popular if e['name'].lower() not in listed]
db_names = set(by_name)
print('COMMUNITY: %d builds by %d players; "most used" needs %d players; %d mods reach it, %d of them on the page lists.'
      % (builds_total, players_total, need, len(popular), len(shown)))
print('MOST USED BUT ON NEITHER LIST (%d):' % len(elsewhere))
for e in elsewhere:
    print('  %3d players  %3d builds  %s%s' % (e['players'], e['builds'], e['name'], '' if e['name'].lower() in db_names else '   (not in the database)'))
print('TALLY NAMES THE DATABASE DOES NOT HAVE (%d): %s' % (
    sum(1 for n in per_mod if n not in db_names), ', '.join(sorted(e['name'] for n, e in per_mod.items() if n not in db_names))))
