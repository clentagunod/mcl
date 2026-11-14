"""Derive reusable, sanitized templates from the supplied Office references.

Usage: python scripts/prepare-print-templates.py path/to/promissory_ref.docx
The original document is only read. No borrower identity image or ID is retained.
"""
from pathlib import Path
import html
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'src' / 'templates'
TARGET.mkdir(parents=True, exist_ok=True)
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + NS['w'] + '}'


def substitute(xml, old, new):
    """Replace text spanning Word runs, retaining all run/paragraph formatting."""
    matches = list(re.finditer(r'<w:t\b[^>]*>(.*?)</w:t>', xml, re.S))
    texts = [html.unescape(m.group(1)) for m in matches]
    combined = ''.join(texts)
    positions = []
    cursor = 0
    for text in texts:
        positions.append(cursor)
        cursor += len(text)
    starts = [m.start() for m in re.finditer(re.escape(old), combined)]
    if not starts:
        raise ValueError('Reference text not found: ' + old)
    for start in reversed(starts):
        end = start + len(old)
        for i in range(len(texts) - 1, -1, -1):
            a, b = positions[i], positions[i] + len(html.unescape(matches[i].group(1)))
            if b <= start or a >= end:
                continue
            left, right = max(0, start - a), min(b - a, end - a)
            texts[i] = texts[i][:left] + (new if a <= start < b else '') + texts[i][right:]
    for m, text in reversed(list(zip(matches, texts))):
        xml = xml[:m.start(1)] + html.escape(text, quote=False) + xml[m.end(1):]
    return xml


with zipfile.ZipFile(sys.argv[1]) as source:
    files = {n: source.read(n) for n in source.namelist()}
xml = files['word/document.xml'].decode('utf-8')
for tag in ['w:drawing', 'w:pict']:
    xml = re.sub(r'<' + tag + r'\b.*?</' + tag + '>', lambda m: '' if 'a:blip' in m.group() or 'v:imagedata' in m.group() else m.group(), xml, flags=re.S)

replacements = {
    '10,000.00': '{{principal}}', 'October 31,2026': '{{approvalDate}}',
    'VEVENCIA G. ARNAIZ': '{{borrower}}',
    'PUROK 13, POBLACION, COMPOSTELA, DAVAO DE ORO': '{{address}}',
    'CRISTOPHER A. LASARTE': '{{payee}}',
    'ELEVEN THOUSAND TWO HUNDRED FIFTY PESOS': '{{amountWords}}',
    '11250.00': '{{total}}', '45': '{{term}}',
    'PHP 150.00 per thousand and PHP 20.00 service charge per thousand': '{{interestStatement}}',
    '250.00': '{{dailyAmount}}', '31th': '{{day}}{{ordinal}}',
    'October+,2026': '{{monthYear}}',
    'Compostela, Davao de Oro, and Philippines': '{{executionPlace}}',
    'NATIONAL ID': '__________', '2739-4913-4762-9408': '____________________',
}
for old, new in replacements.items():
    xml = substitute(xml, old, new)
xml = substitute(xml, 'ACKNOWLEDGEMEN', 'ACKNOWLEDGEMENT')
assert xml.count('<w:t>____________</w:t>') == 1
xml = xml.replace('<w:t>____________</w:t>', '<w:t>{{cellphone}}</w:t>')

# Apply the requested more open typography to Word as well as the browser.
# Word line spacing is in 240ths of a line; paragraph gaps are twentieths of a point.
def spaced_paragraph(match):
    paragraph = match.group()
    text = ''.join(html.unescape(t) for t in re.findall(r'<w:t\b[^>]*>(.*?)</w:t>', paragraph, re.S)).strip()
    if not text:
        line, after = 192, 0
    elif 'Co-Maker Signature' in text or 'Valid ID' in text or 'Issued on' in text or 'Contact Number' in text:
        line, after = 324, 0
    elif 'PROMISSORY NOTE' == text or text.startswith('PRINCIPAL AMOUNT:'):
        line, after = 283, 160
    else:
        line, after = 283, 40
    spacing = f'<w:spacing w:before="0" w:after="{after}" w:line="{line}" w:lineRule="auto"/>'
    if '<w:spacing ' in paragraph:
        return re.sub(r'<w:spacing\b[^>]*/>', spacing, paragraph, count=1)
    if '<w:pPr>' in paragraph:
        def insert_spacing(properties):
            # OOXML places paragraph spacing before indentation, alignment and
            # paragraph-mark run properties. Keep the source property order valid.
            following = re.search(r'<w:(?:ind|jc|rPr)\b', properties.group())
            position = following.start() if following else properties.group().index('</w:pPr>')
            return properties.group()[:position] + spacing + properties.group()[position:]
        return re.sub(r'<w:pPr>.*?</w:pPr>', insert_spacing, paragraph, count=1, flags=re.S)
    return re.sub(r'(<w:p\b[^>]*>)', r'\1<w:pPr>' + spacing + '</w:pPr>', paragraph, count=1)


xml = re.sub(r'<w:p\b[^>]*>.*?</w:p>', spaced_paragraph, xml, flags=re.S)

# Match corresponding signature fields in fixed columns instead of using tabs.
signature_rows = [
    ('{{coMakerName}}', '{{borrower}}'),
    ('Co-Maker Signature over Printed Name', 'Debtor/Borrower Signature'),
    ('Valid ID: {{coMakerValidIdType}}', 'Valid ID: {{validIdType}}'),
    ('Valid ID #: {{coMakerValidIdNumber}}', 'Valid ID #: {{validIdNumber}}'),
    ('Issued on {{coMakerValidIdIssuedOn}} at {{coMakerValidIdIssuedAt}}', 'Issued on {{validIdIssuedOn}} at {{validIdIssuedAt}}'),
    ('Contact Number: {{coMakerContactNumber}}', 'Contact Number: {{cellphone}}'),
]
paragraph_matches = list(re.finditer(r'<w:p\b[^>]*>.*?</w:p>', xml, re.S))
assert '{{borrower}}' in paragraph_matches[14].group()
assert 'Contact Number' in paragraph_matches[18].group()
page = ET.fromstring(xml).find('w:body/w:sectPr', NS)
page_size, margins = page.find('w:pgSz', NS), page.find('w:pgMar', NS)
table_width = int(page_size.get(W + 'w')) - int(margins.get(W + 'left')) - int(margins.get(W + 'right')) - 720
column_width = table_width // 2


def signature_cell(value, row, column):
    emphasis = '<w:b/><w:u w:val="single"/>' if row == 0 else ''
    keep_next = '<w:keepNext/>' if row < len(signature_rows) - 1 else ''
    return f'''<w:tc><w:tcPr><w:tcW w:w="{column_width}" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr>
<w:p><w:pPr><w:pStyle w:val="NoSpacing"/>{keep_next}<w:spacing w:before="0" w:after="0" w:line="324" w:lineRule="auto"/></w:pPr>
<w:r><w:rPr>{emphasis}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">{html.escape(value, quote=False)}</w:t></w:r></w:p></w:tc>'''


word_rows = ''.join('<w:tr><w:trPr><w:cantSplit/>' + ('<w:trHeight w:val="397" w:hRule="atLeast"/>' if row == 0 else '') + '</w:trPr>'
                    + ''.join(signature_cell(value, row, col) for col, value in enumerate(values)) + '</w:tr>'
                    for row, values in enumerate(signature_rows))
word_table = f'''<w:tbl><w:tblPr><w:tblW w:w="{table_width}" w:type="dxa"/><w:tblInd w:w="720" w:type="dxa"/>
<w:tblBorders>{''.join(f'<w:{side} w:val="nil"/>' for side in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'])}</w:tblBorders>
<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="180" w:type="dxa"/></w:tblCellMar></w:tblPr>
<w:tblGrid><w:gridCol w:w="{column_width}"/><w:gridCol w:w="{column_width}"/></w:tblGrid>{word_rows}</w:tbl>'''
word_xml = xml[:paragraph_matches[14].start()] + word_table + xml[paragraph_matches[18].end():]
files['word/document.xml'] = word_xml.encode()
for name in list(files):
    if name.startswith('word/media/') or name.startswith('docProps/'):
        del files[name]
for name in list(files):
    if name.endswith('.rels'):
        rel = files[name].decode('utf-8')
        rel = re.sub(r'<Relationship\b[^>]*(?:media/|docProps/)[^>]*/>', '', rel)
        files[name] = rel.encode()
files['[Content_Types].xml'] = re.sub(rb'<Override\b[^>]*PartName="/docProps/[^>]*/>', b'', files['[Content_Types].xml'])
with zipfile.ZipFile(TARGET / 'promissory.docx', 'w', zipfile.ZIP_DEFLATED) as output:
    for name, data in files.items():
        output.writestr(name, data)

root = ET.fromstring(xml)
paragraphs = root.findall('w:body/w:p', NS)
html_parts = []
number = 0


def font_css(properties):
    """Preserve explicit source typefaces without fixing the studio font size."""
    if properties is None:
        return []
    fonts = properties.find('w:rFonts', NS)
    if fonts is None:
        return []
    family = fonts.get(W + 'ascii') or fonts.get(W + 'hAnsi')
    if not family:
        return []
    # Only a literal font family is allowed in the generated inline declaration.
    family = re.sub(r'[^\w\s-]', '', family)
    return ["font-family:'" + family + "'"] if family else []


for i, p in enumerate(paragraphs):
    if i == 1:
        # Word uses tab stops for this row. A two-column row keeps that alignment
        # in the browser even when the approval date or amount is longer.
        html_parts.append('''<p class="note-p note-p-1 note-metadata"><span><b>PRINCIPAL AMOUNT: <u>{{principal}}</u></b></span><span><b>Date: {{approvalDate}}</b></span></p>''')
        continue
    if i == 14:
        table_rows = []
        for row, values in enumerate(signature_rows):
            cells = []
            for column, value in enumerate(values):
                content = html.escape(value)
                if row == 0:
                    content = '<span class="note-signature-name"><b><u>' + content + '</u></b></span>'
                cells.append('<td>' + content + '</td>')
            table_rows.append('<tr>' + ''.join(cells) + '</tr>')
        html_parts.append('<table class="note-signatures" aria-label="Co-maker and borrower signatures"><colgroup><col style="width:50%"><col style="width:50%"></colgroup><tbody>' + ''.join(table_rows) + '</tbody></table>')
    if 14 <= i <= 18:
        continue
    text = ''.join(t.text or '' for t in p.findall('./w:r/w:t', NS))
    # Word's floating word-art boxes have no paragraph text. The ID photo is omitted.
    if not text and i >= 33:
        continue
    props = p.find('w:pPr', NS)
    css = []
    if props is not None:
        css.extend(font_css(props.find('w:rPr', NS)))
        align = props.find('w:jc', NS)
        if align is not None:
            css.append('text-align:' + align.get(W + 'val'))
        indent = props.find('w:ind', NS)
        if indent is not None:
            css.append('margin-left:' + str(int(indent.get(W + 'left', '0')) / 20) + 'pt')
            if indent.get(W + 'right'):
                css.append('margin-right:' + str(int(indent.get(W + 'right')) / 20) + 'pt')
    runs = []
    for run in p.findall('w:r', NS):
        value = ''.join(t.text or '' for t in run.findall('w:t', NS))
        if not value:
            continue
        style = []
        rpr = run.find('w:rPr', NS)
        if rpr is not None:
            style.extend(font_css(rpr))
            for tag, rule in [('b', 'font-weight:bold'), ('i', 'font-style:italic'), ('u', 'text-decoration:underline')]:
                if rpr.find('w:' + tag, NS) is not None:
                    style.append(rule)
            if rpr.find('w:vertAlign', NS) is not None:
                style.append('vertical-align:super;font-size:0.75em')
        runs.append('<span style="' + html.escape(';'.join(style), quote=True) + '">' + html.escape(value) + '</span>')
    if props is not None and props.find('w:numPr', NS) is not None:
        number += 1
        content = '<span class="note-number">' + str(number) + '.</span>' + ''.join(runs)
        css.append('margin-left:12.7mm;padding-left:0;position:relative')
    else:
        content = ''.join(runs) if runs else '&#160;'
    spacer_class = ' note-spacer' if not text.strip() else ''
    html_parts.append('<p class="note-p note-p-' + str(i) + spacer_class + '" style="' + html.escape(';'.join(css), quote=True) + '">' + content + '</p>')
# Floating labels are included only if they actually exist in the reference.
# The revised reference deliberately removes the old bottom identity boxes.
shape_labels = [t.text or '' for t in root.findall('.//w:txbxContent//w:t', NS)]
if 'CO-MAKER' in shape_labels and 'DEBTOR' in shape_labels:
    html_parts.append('<div class="note-id-boxes"><div>CO-MAKER</div><div>DEBTOR</div></div>')
(TARGET / 'promissory.html').write_text('\n'.join(html_parts), encoding='utf-8')
assert 'ARNAIZ' not in xml and '2739-4913' not in xml
assert not any(n.startswith('word/media/') for n in files)
print('Prepared sanitized DOCX and HTML templates in', TARGET)
