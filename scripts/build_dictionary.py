import os
import re
import csv
import io
import json
import urllib.request

os.makedirs('data', exist_ok=True)

print("1. Fetching word frequency list (Google 10k English words)...")
freq_url = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt'
with urllib.request.urlopen(freq_url) as resp:
    top_words = [line.decode('utf-8').strip().lower() for line in resp.readlines() if line.decode('utf-8').strip()]
print(f"   Loaded {len(top_words)} high-frequency words.")

print("2. Fetching BengaliDictionary_36.csv (Definitions + Part of Speech)...")
url_36 = 'https://raw.githubusercontent.com/MinhasKamal/BengaliDictionary/master/BengaliDictionary_36.csv'
with urllib.request.urlopen(url_36) as resp:
    data_36 = resp.read().decode('utf-8', errors='ignore').lstrip('\ufeff')
reader_36 = csv.reader(io.StringIO(data_36))
dict_36 = {r[0].strip().lower(): r[1].strip() for r in reader_36 if len(r) >= 2 and r[0].strip()}
print(f"   Loaded {len(dict_36)} entries from 36.csv.")

print("3. Fetching BengaliDictionary_93.csv (Expanded Modern Vocabulary)...")
url_93 = 'https://raw.githubusercontent.com/MinhasKamal/BengaliDictionary/master/BengaliDictionary_93.csv'
with urllib.request.urlopen(url_93) as resp:
    data_93 = resp.read().decode('utf-8', errors='ignore').lstrip('\ufeff')
reader_93 = csv.reader(io.StringIO(data_93))
dict_93 = {r[0].strip().lower(): r[1].strip() for r in reader_93 if len(r) >= 2 and r[0].strip()}
print(f"   Loaded {len(dict_93)} entries from 93.csv.")

print("4. Fetching BengaliDictionary.json (Phonetic pronunciations)...")
dict_json_url = 'https://raw.githubusercontent.com/MinhasKamal/BengaliDictionary/master/BengaliDictionary.json'
req_json = urllib.request.Request(dict_json_url, headers={'User-Agent': 'Mozilla/5.0'})
pron_map = {}
try:
    with urllib.request.urlopen(req_json) as resp:
        raw_json = json.loads(resp.read().decode('utf-8', errors='ignore').lstrip('\ufeff'))
        for item in raw_json:
            en = item.get('en', '').strip().lower()
            pron_list = item.get('pron', [])
            if en and pron_list and pron_list[0]:
                pron_map[en] = pron_list[0].strip()
    print(f"   Loaded {len(pron_map)} pronunciations from json dataset.")
except Exception as e:
    print(f"   Warning: Could not fetch pronunciation JSON: {e}")

def parse_pos_and_bn(raw_text):
    pos = ''
    if '(N)' in raw_text or '(n)' in raw_text:
        pos = 'noun'
    elif '(V)' in raw_text or '(v)' in raw_text:
        pos = 'verb'
    elif '(Adj.)' in raw_text or '(adj)' in raw_text or '(Adj)' in raw_text:
        pos = 'adjective'
    elif '(Adv.)' in raw_text or '(adv)' in raw_text or '(Adv)' in raw_text:
        pos = 'adverb'
    elif '(Prep.)' in raw_text or '(prep)' in raw_text:
        pos = 'preposition'
    elif '(Conj.)' in raw_text or '(conj)' in raw_text:
        pos = 'conjunction'
    elif '(Pron.)' in raw_text or '(pron)' in raw_text:
        pos = 'pronoun'
    elif '(Interj.)' in raw_text or '(interj)' in raw_text:
        pos = 'interjection'

    # Strip POS tags from Bengali definition
    clean_bn = re.sub(r'\s*\((?:N|V|Adj\.|Adj|Adv\.|Adv|Prep\.|Prep|Conj\.|Conj|Pron\.|Pron|Interj\.)\)', '', raw_text)
    # Clean leading numbering like '1. ' or '2. '
    clean_bn = re.sub(r'^\d+\.\s*', '', clean_bn)
    meanings = [m.strip() for m in clean_bn.split(',') if m.strip()]
    short_bn = ', '.join(meanings[:3]) if meanings else clean_bn.strip()
    return pos, short_bn

curated = {}

# Priority 1: High-frequency words
for w in top_words:
    if not w.isalpha() or len(w) < 2:
        continue
    pos, bn = '', ''
    if w in dict_36:
        pos, bn = parse_pos_and_bn(dict_36[w])
    elif w in dict_93:
        pos, bn = parse_pos_and_bn(dict_93[w])
    
    if bn:
        entry = {'bn': bn}
        if pos:
            entry['pos'] = pos
        if w in pron_map:
            entry['pron'] = pron_map[w]
        curated[w] = entry

print(f"5. Curated {len(curated)} high-frequency words.")

# Priority 2: Supplement with other core vocabulary from 36.csv up to 9,500 entries
for w, raw_val in dict_36.items():
    if len(curated) >= 9500:
        break
    if w not in curated and w.isalpha() and len(w) > 2:
        pos, bn = parse_pos_and_bn(raw_val)
        if bn:
            entry = {'bn': bn}
            if pos:
                entry['pos'] = pos
            if w in pron_map:
                entry['pron'] = pron_map[w]
            curated[w] = entry

print(f"6. Total curated dictionary entries: {len(curated)}")

out_path = 'data/dictionary.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(curated, f, ensure_ascii=False, separators=(',', ':'))

file_size = os.path.getsize(out_path)
print(f"Saved {out_path} ({file_size / 1024:.1f} KB).")

# Verification samples
print("\n--- Verification Samples ---")
for test_w in ['the', 'computer', 'learn', 'software', 'student', 'knowledge', 'book', 'beautiful', 'developer']:
    print(f"{test_w}: {curated.get(test_w)}")
