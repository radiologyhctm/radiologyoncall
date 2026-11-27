/* ===== Core logic: kadar, pecahan slot, susun atur borang, isi .docx ===== */
var Core = (function () {
  var HARI = ['AHAD', 'ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT', 'SABTU'];
  var BULAN = ['JANUARI', 'FEBRUARI', 'MAC', 'APRIL', 'MEI', 'JUN', 'JULAI', 'OGOS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DISEMBER'];
  var KADAR = ['A', 'B', 'C', 'D', 'E'];
  var KADAR_INFO = {
    A: { r: '1.125', t: 'Hari bekerja, 6 pagi – 10 malam' },
    B: { r: '1.25', t: 'Hari bekerja malam / hari minggu siang' },
    C: { r: '1.50', t: 'Hari minggu, 10 malam – 6 pagi' },
    D: { r: '1.75', t: 'Kelepasan am, 6 pagi – 10 malam' },
    E: { r: '2.00', t: 'Kelepasan am, 10 malam – 6 pagi' }
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // "2100", "21:00", "21.00", "900" -> minutes from midnight (0..1439), or null
  function parseTime(s) {
    if (s == null) return null;
    s = String(s).trim().replace(/[:.\s]/g, '');
    if (!/^\d{3,4}$/.test(s)) return null;
    if (s.length === 3) s = '0' + s;
    var h = +s.slice(0, 2), m = +s.slice(2);
    if (h === 24 && m === 0) return 0;
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }
  function fmtTime(min) { min = ((min % 1440) + 1440) % 1440; return pad2(Math.floor(min / 60)) + pad2(min % 60); }

  // ISO date helpers (local, no TZ drift)
  function isoToDate(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dateToIso(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function addDays(iso, n) { var d = isoToDate(iso); d.setDate(d.getDate() + n); return dateToIso(d); }
  function fmtDate(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function dayName(iso) { return HARI[isoToDate(iso).getDay()]; }
  function isWeekend(iso, weekendDays) { return (weekendDays || [0, 6]).indexOf(isoToDate(iso).getDay()) >= 0; }

  function isNight(startMin) { return startMin >= 1320 || startMin < 360; }

  // Kadar for a slot starting at startMin on date iso
  function classify(iso, startMin, holidays, weekendDays) {
    var night = isNight(startMin);
    if (holidays && holidays[iso]) return night ? 'E' : 'D';
    if (isWeekend(iso, weekendDays)) return night ? 'C' : 'B';
    return night ? 'B' : 'A';
  }

  // Split a slot at 06:00 and 22:00 boundaries. Each piece is dated by the calendar day it starts on.
  function splitSlot(iso, start, end) {
    var s = parseTime(start), e = parseTime(end);
    if (s == null || e == null || s === e) return [];
    if (e <= s) e += 1440;
    var cuts = [];
    for (var b = 0; b <= 2880; b += 1440) { cuts.push(b + 360); cuts.push(b + 1320); }
    var pieces = [], cur = s;
    cuts.sort(function (a, b) { return a - b; }).forEach(function (c) {
      if (c > cur && c < e) { pieces.push([cur, c]); cur = c; }
    });
    pieces.push([cur, e]);
    return pieces.map(function (p) {
      var dayOff = Math.floor(p[0] / 1440);
      return { date: addDays(iso, dayOff), start: fmtTime(p[0]), end: fmtTime(p[1]) };
    });
  }

  function durationMin(start, end) {
    var s = parseTime(start), e = parseTime(end);
    if (s == null || e == null) return 0;
    if (e <= s) e += 1440;
    return e - s;
  }

  function hakikiCells(h) {
    h = (h || '').trim().toUpperCase();
    if (!h) return ['', ''];
    if (h === 'OFF DAY' || h === 'OFF') return ['OFF', 'DAY'];
    if (h === 'PH') return ['PH', 'PH'];
    var m = h.match(/^(\d{3,4})\s*[-–]\s*(\d{3,4})$/);
    if (m) return [fmtTime(parseTime(m[1])), fmtTime(parseTime(m[2]))];
    var parts = h.split(/\s+/);
    return [parts[0] || '', parts.slice(1).join(' ')];
  }

  function entryKadar(en, holidays, weekendDays) {
    if (en.kadar && KADAR.indexOf(en.kadar) >= 0) return en.kadar;
    return classify(en.date, parseTime(en.start), holidays, weekendDays);
  }

  function sortEntries(list) {
    return list.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var sa = parseTime(a.start), sb = parseTime(b.start);
      // treat after-midnight early slots (00-06) as later than evening ones? keep plain order within a day
      return sa - sb;
    });
  }

  // Build 31 form rows. Each row: {c: {colIndex: text}, bold: bool, kind}
  // Oncall slots vs lebih masa (Satu slot). Entries carry src 'oc' / 'one'; older entries are classed by their times.
  function isOncallEntry(en, holidays) {
    if (en.src === 'oc') return true;
    if (en.src === 'one') return false;
    var t = fmtTime(parseTime(en.start)) + '-' + fmtTime(parseTime(en.end));
    if (t === '2100-2200' || t === '2300-0600' || t === '0600-0800') return true;
    var off = isWeekend(en.date) || !!(holidays && holidays[en.date]);
    return off && (t === '0800-1400' || t === '1400-2100');
  }
  // Build 31 form rows. Each row: {c: {colIndex: text}, bold: bool, kind}
  // Oncall groups (A→E) first, then lebih masa groups (A→E) below them.
  function buildLayout(entries, holidays, weekendDays) {
    var rows = [], totals = {}, grand = 0;
    KADAR.forEach(function (k) { totals[k] = 0; });
    var labels = [];
    var lm = entries.filter(function (en) { return !isOncallEntry(en, holidays); });
    var sections = [{ list: entries.filter(function (en) { return isOncallEntry(en, holidays); }), sec: 'oc' }];
    ['KARDIAK', 'ANGIO'].forEach(function (j) { sections.push({ list: lm.filter(function (en) { return en.jenis === j; }), sec: 'lm', jenis: j }); });
    sections.push({ list: lm.filter(function (en) { return en.jenis !== 'KARDIAK' && en.jenis !== 'ANGIO'; }), sec: 'lm' });
    sections.forEach(function (S2, si) {
      var list = S2.list;
      if (!list.length) return;
      if (rows.length) rows.push({ c: {}, bold: false, kind: 'blank' });
      // the KETERANGAN brace on the form covers rows 1-13, so a labelled lebih masa section starts at row 14 or later
      if (S2.jenis) { while (rows.length < 13) rows.push({ c: {}, bold: false, kind: 'blank' }); labels.push({ r: rows.length + 1, jenis: S2.jenis }); }
      var groups = {};
      KADAR.forEach(function (k) { groups[k] = []; });
      list.forEach(function (en) { groups[entryKadar(en, holidays, weekendDays)].push(en); });
      var used = KADAR.filter(function (k) { return groups[k].length; });
      used.forEach(function (k, gi) {
        var mins = 0;
        sortEntries(groups[k]).forEach(function (en) {
          var d = durationMin(en.start, en.end); mins += d;
          var hk = hakikiCells((holidays && holidays[en.date] && /^OFF( DAY)?$/i.test((en.hakiki||'').trim())) ? 'PH' : en.hakiki);
          var c = {};
          c[1] = fmtDate(en.date); c[2] = dayName(en.date) + (holidays && holidays[en.date] ? '*' : '');
          c[3] = fmtTime(parseTime(en.start)); c[4] = fmtTime(parseTime(en.end));
          c[5] = pad2(Math.floor(d / 60)); c[6] = pad2(d % 60);
          c[7 + KADAR.indexOf(k)] = '/';
          c[13] = hk[0]; c[14] = hk[1];
          rows.push({ c: c, bold: false, kind: 'entry', kadar: k, id: en.id, sec: S2.sec });
        });
        var t = {}; t[4] = 'JUMLAH'; t[5] = pad2(Math.floor(mins / 60)); t[6] = pad2(mins % 60);
        rows.push({ c: t, bold: true, kind: 'total', kadar: k });
        totals[k] += mins; grand += mins;
        if (gi < used.length - 1) rows.push({ c: {}, bold: false, kind: 'blank' });
      });
    });
    KADAR.forEach(function (k) { if (!totals[k]) delete totals[k]; });
    return { rows: rows, totals: totals, grand: grand, labels: labels, overflow: rows.length > 31 };
  }

  function xmlEsc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // All filled-in text: Calibri 10pt
  function rpr(bold) {
    return '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>' +
      (bold ? '<w:b/><w:bCs/>' : '') + '<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="ms-MY"/></w:rPr>';
  }
  function run(text, bold) {
    if (text == null || text === '') return '';
    return '<w:r>' + rpr(bold) + '<w:t xml:space="preserve">' + xmlEsc(text) + '</w:t></w:r>';
  }

  // Fill document.xml. info = {nama, tel, pekerja, alamat, jabatan, bulan (e.g. "NOVEMBER 2026"), tarikh (dd/mm/yyyy)}
  function fillDocumentXml(xml, info, layout) {
    var head = { NAMA: info.nama, TEL: info.tel, PEKERJA: info.pekerja, ALAMAT: info.alamat, JABATAN: info.jabatan, BULAN: info.bulan, TARIKH: info.tarikh };
    Object.keys(head).forEach(function (k) {
      var v = (head[k] || '').toString();
      v = (k === 'TARIKH' ? '  ' : ' ') + v; // original form has leading spaces before values
      var re = new RegExp('<w:r>(?:<w:rPr>(?:(?!<\\/w:rPr>)[\\s\\S])*<\\/w:rPr>)?<w:t xml:space="preserve">@@' + k + '@@<\\/w:t><\\/w:r>');
      xml = xml.replace(re, function () { return run(v, k === 'TARIKH'); });
    });
    var ket = info.ket || [];
    xml = xml.replace(/<w:r>(<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)<w:t xml:space="preserve">@@K(\d+)@@<\/w:t><\/w:r>/g, function (_, rpr, r) {
      var t = ket[+r - 1];
      if (t == null || String(t).trim() === '') return '';
      return run(String(t), true);
    });
    xml = xml.replace(/<w:r><w:t>@@R(\d+)C(\d+)@@<\/w:t><\/w:r>/g, function (_, r, c) {
      var row = layout.rows[+r - 1];
      if (!row) return '';
      var t = row.c[+c];
      // PH day name ("JUMAAT*"): superscript asterisk + slightly tighter letters so 10pt fits the narrow HARI column
      if (+c === 2 && t && /\*$/.test(t)) {
        var tight = rpr(row.bold).replace('<w:sz ', '<w:spacing w:val="-8"/><w:sz ');
        var sup = rpr(row.bold).replace('<w:sz ', '<w:vertAlign w:val="superscript"/><w:sz ');
        return '<w:r>' + tight + '<w:t xml:space="preserve">' + xmlEsc(t.slice(0, -1)) + '</w:t></w:r>' +
               '<w:r>' + sup + '<w:t>*</w:t></w:r>';
      }
      return run(t, row.bold);
    });
    return xml;
  }

  function monthLabel(ym) { var p = ym.split('-'); return BULAN[+p[1] - 1] + ' ' + p[0]; }

  return {
    HARI: HARI, BULAN: BULAN, KADAR: KADAR, KADAR_INFO: KADAR_INFO,
    pad2: pad2, parseTime: parseTime, fmtTime: fmtTime, addDays: addDays, fmtDate: fmtDate,
    dayName: dayName, isWeekend: isWeekend, classify: classify, splitSlot: splitSlot,
    durationMin: durationMin, hakikiCells: hakikiCells, entryKadar: entryKadar,
    sortEntries: sortEntries, buildLayout: buildLayout, isOncallEntry: isOncallEntry, fillDocumentXml: fillDocumentXml,
    monthLabel: monthLabel, dateToIso: dateToIso, isoToDate: isoToDate
  };
})();
if (typeof module !== 'undefined') module.exports = Core;
