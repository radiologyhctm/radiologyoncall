(function(){
"use strict";
var C = Core, $ = function(id){return document.getElementById(id);};
var TPL = null, PDFBG = null;
function loadTpl(){
  if(TPL) return Promise.resolve(TPL);
  var el = $('tpl');
  if(el && el.textContent.trim()){ TPL = JSON.parse(el.textContent); return Promise.resolve(TPL); }
  return fetch('template.json').then(function(r){
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }).then(function(d){ TPL = d; return d; });
}
function loadPdfBg(){
  if(PDFBG) return Promise.resolve(PDFBG);
  var el = $('pdfbg');
  if(el && el.textContent.trim()){ PDFBG = JSON.parse(el.textContent); return Promise.resolve(PDFBG); }
  return fetch('pdfbg.json').then(function(r){
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }).then(function(d){ PDFBG = d; return d; });
}

/* ---------- defaults ---------- */
var DEFAULT_HOL = {
 "2026-01-01":"Tahun Baharu","2026-02-01":"Thaipusam & Hari Wilayah Persekutuan","2026-02-02":"Cuti ganti Thaipusam / Hari Wilayah",
 "2026-02-17":"Tahun Baru Cina","2026-02-18":"Tahun Baru Cina (hari kedua)","2026-03-07":"Nuzul Al-Quran",
 "2026-03-21":"Hari Raya Aidilfitri","2026-03-22":"Hari Raya Aidilfitri (hari kedua)","2026-03-23":"Cuti ganti Hari Raya Aidilfitri",
 "2026-05-01":"Hari Pekerja","2026-05-27":"Hari Raya Haji","2026-05-31":"Hari Wesak","2026-06-01":"Hari Keputeraan YDP Agong / ganti Wesak",
 "2026-06-17":"Awal Muharram","2026-08-25":"Maulidur Rasul","2026-08-31":"Hari Kebangsaan","2026-09-16":"Hari Malaysia",
 "2026-11-08":"Deepavali","2026-11-09":"Cuti ganti Deepavali","2026-12-25":"Hari Krismas",
 "2027-01-01":"Tahun Baharu","2027-01-22":"Thaipusam","2027-02-01":"Hari Wilayah Persekutuan","2027-02-06":"Tahun Baru Cina",
 "2027-02-07":"Tahun Baru Cina (hari kedua)","2027-02-08":"Cuti ganti Tahun Baru Cina (semak)","2027-02-24":"Nuzul Al-Quran",
 "2027-03-10":"Hari Raya Aidilfitri*","2027-03-11":"Hari Raya Aidilfitri (hari kedua)*","2027-05-01":"Hari Pekerja",
 "2027-05-17":"Hari Raya Haji*","2027-05-20":"Hari Wesak","2027-06-06":"Awal Muharram","2027-06-07":"Hari Keputeraan YDP Agong",
 "2027-08-15":"Maulidur Rasul","2027-08-16":"Cuti ganti Maulidur Rasul (semak)","2027-08-31":"Hari Kebangsaan","2027-09-16":"Hari Malaysia",
 "2027-10-28":"Deepavali*","2027-12-25":"Hari Krismas"
};
var DEFAULT_SEGS = [{off:0,s:"2100",e:"2200"},{off:0,s:"2300",e:"0600"},{off:1,s:"0600",e:"0800"}];
var DEFAULT_WK = {"6":{s:"0800",e:"1400"},"0":{s:"0800",e:"1400"},"ph":{s:"0800",e:"1400"}};
var DEFAULT_KET = ["MENJALANKAN","TUGAS LEBIH MASA","DI","JABATAN RADIOLOGI,","WAD-WAD,","UNIT KECEMASAN","DAN","DEWAN BEDAH","HCTM"];
var KET_PRESETS = { hctm: DEFAULT_KET, ct: ["MENJALANKAN","TUGAS LEBIH MASA","DI","CT SCAN"] };
function ketPresetOf(){ var t=ketLines().join('\n').replace(/\n+$/,''); for(var k in KET_PRESETS){ if(KET_PRESETS[k].join('\n')===t) return k; } return 'custom'; }
// KETERANGAN column for every form row: the main text from row 2, then "LEBIH MASA / <jenis>" beside each lebih masa section.
function ketAll(layout){
  var arr=ketRows().slice(0,31), last=0;
  arr.forEach(function(t,i){ if(t) last=i+1; });
  var cur=last?Math.max(last+2,14):1;
  (layout.labels||[]).forEach(function(lb){
    var r=Math.max(lb.r,cur); if(r+1>31) return;
    arr[r-1]='LEBIH MASA'; arr[r]=lb.jenis; cur=r+2;
  });
  for(var i=0;i<31;i++) if(arr[i]==null) arr[i]='';
  return arr;
}
function ketLines(){ var t=(S.main.ket!=null)?String(S.main.ket):DEFAULT_KET.join('\n'); return t.replace(/\r/g,'').split('\n').map(function(l){ return l.trim().toUpperCase(); }).slice(0,30); }
function ketRows(){ return [''].concat(ketLines()); } // row 1 empty, text from row 2
var HK_OPTS = ["0800-1400","1400-2100","2100-0800","0800-1700","OFF DAY","PH","CUTI",""];

/* ---------- state ---------- */
function defaultMain(){ return { profile:{nama:"",tel:"",pekerja:"",alamat:"",jabatan:"RADIOLOGI"}, holidays:JSON.parse(JSON.stringify(DEFAULT_HOL)), segs:JSON.parse(JSON.stringify(DEFAULT_SEGS)), wk:JSON.parse(JSON.stringify(DEFAULT_WK)), wkv:2, segv:2, hkOpts:[], updatedAt:0 }; }
var S = {
  main: defaultMain(),
  months: {},          // ym -> {entries:[], updatedAt}
  ym: null,
  editId: null
};
function todayIso(){ return C.dateToIso(new Date()); }
function ymOf(iso){ return iso.slice(0,7); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

/* ---------- persistence (localStorage) ---------- */
function lsGet(k){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):null; }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
function keyFor(name){ return name==='main' ? 'oncall:main' : 'oncall:'+name; }

function setSave(t){ $('saveState').textContent=t; }
function schedule(name){
  var obj = name==='main' ? S.main : S.months[name.slice(2)];
  obj.updatedAt = Date.now();
  lsSet(keyFor(name), obj);
  setSave('Disimpan dalam peranti ✓');
}
function loadDoc(name){
  return Promise.resolve(lsGet(keyFor(name)));
}
function ensureMonth(ym){
  if(S.months[ym]) return Promise.resolve(S.months[ym]);
  return loadDoc('m-'+ym).then(function(d){
    if(!S.months[ym]) S.months[ym] = d && d.entries ? d : {entries:[],updatedAt:0};
    return S.months[ym];
  });
}

/* ---------- helpers ---------- */
function rawHol(){ return S.main.holidays||{}; }
function shiftDays(){ return S.main.shiftDays||{'0':true,'6':false}; }
var holCache={key:null,map:{},moved:{}};
// Effective public holidays: a holiday on a "shift" day (default Sunday) is not counted;
// it moves to the next working day that is not already a holiday.
function computeHol(){
  var raw=rawHol(), sd=shiftDays(), key=JSON.stringify(raw)+JSON.stringify(sd);
  if(holCache.key===key) return holCache;
  var map={}, moved={}, claimed={}, keys=Object.keys(raw).sort();
  keys.forEach(function(k){ if(!sd[String(C.isoToDate(k).getDay())]) map[k]=raw[k]; });
  keys.forEach(function(k){
    if(!sd[String(C.isoToDate(k).getDay())]) return;
    var t=C.addDays(k,1), guard=0;
    while(guard++<14 && (C.isWeekend(t) || claimed[t] || (map[t] && !/^Cuti ganti/i.test(map[t])))) t=C.addDays(t,1);
    if(!map[t]) map[t]='Cuti ganti '+raw[k];
    claimed[t]=1; moved[k]=t;
  });
  holCache={key:key,map:map,moved:moved};
  return holCache;
}
function hol(){ return computeHol().map; }
function dayTag(iso){
  if(hol()[iso]) return '<span class="tag ph">Cuti umum</span>';
  if(C.isWeekend(iso)) return '<span class="tag we">Hujung minggu</span>';
  return '';
}
function autoHk(iso, fallback){ return hol()[iso] ? 'PH' : (C.isWeekend(iso) ? 'OFF DAY' : fallback); }
function kBadge(k){ return '<span class="kb k'+k+'">'+k+'</span>'; }
function hm(min){ var h=Math.floor(min/60), m=min%60; return h+'j'+(m?(' '+m+'m'):''); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
var toastT; function toast(t){ var el=$('toast'); el.textContent=t; el.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(function(){el.classList.remove('on');},2600); }
function confirmBox(text,yes){ return new Promise(function(res){ $('mText').textContent=text; $('mYes').textContent=yes||'Ya'; $('modal').classList.add('on');
  $('mYes').onclick=function(){ $('modal').classList.remove('on'); res(true); };
  $('mNo').onclick=function(){ $('modal').classList.remove('on'); res(false); }; }); }
function normTimeInput(el){ var v=el.value.trim(); if(!v){ el.classList.remove('bad'); return null; } var m=C.parseTime(v);
  if(m==null){ el.classList.add('bad'); return null; } el.classList.remove('bad'); el.value=C.fmtTime(m); return el.value; }

/* hakiki selector widget */
function hkOptions(){ var o=HK_OPTS.slice(); (S.main.hkOpts||[]).forEach(function(x){ if(o.indexOf(x)<0) o.splice(o.length-1,0,x); }); return o; }
function buildHk(container, value, onChange){
  var opts=hkOptions(); if(value && opts.indexOf(value)<0) opts.splice(opts.length-1,0,value);
  container.innerHTML='<select>'+opts.map(function(o){ return '<option value="'+esc(o)+'">'+(o===''?'(kosong)':esc(o))+'</option>'; }).join('')+'<option value="__c">Lain…</option></select><input type="text" placeholder="cth. 0700-1500">';
  var sel=container.querySelector('select'), inp=container.querySelector('input');
  sel.value=value==null?'0800-1400':value;
  sel.onchange=function(){ if(sel.value==='__c'){ container.classList.add('custom'); inp.focus(); } else { container.classList.remove('custom'); onChange&&onChange(); } };
  inp.oninput=function(){ onChange&&onChange(); };
  container.getValue=function(){ if(sel.value==='__c') return inp.value.trim().toUpperCase(); return sel.value; };
  container.setValue=function(v){ if(opts.indexOf(v)<0 && v){ sel.value='__c'; container.classList.add('custom'); inp.value=v; } else { sel.value=v; container.classList.remove('custom'); } };
}
function rememberHk(v){ if(v && HK_OPTS.indexOf(v)<0 && (S.main.hkOpts||[]).indexOf(v)<0){ S.main.hkOpts=(S.main.hkOpts||[]).concat(v).slice(-8); schedule('main'); } }

/* ---------- weekend shifts ---------- */
var WK_NAME={"6":"Sabtu","0":"Ahad","ph":"PH"};
function wkShift(iso){
  var weekend=C.isWeekend(iso), key = (!weekend && hol()[iso]) ? 'ph' : (weekend ? String(C.isoToDate(iso).getDay()) : null);
  if(!key) return null; var w=DEFAULT_WK[key];
  if(!w||C.parseTime(w.s)==null||C.parseTime(w.e)==null) return null;
  return {day:C.dayName(iso).charAt(0)+C.dayName(iso).slice(1).toLowerCase(), label: key==='ph'?'Syif cuti umum':'Syif hujung minggu', s:w.s, e:w.e};
}
function isOffDay(iso){ return C.isWeekend(iso) || !!hol()[iso]; }
var ocWkOn={};
// Weekend day right after an oncall (Fri->Sat, Sat->Sun): that day's shift is the post-oncall shift (default 1400-2100)
function friShift(d){
  if(!d) return null;
  var n=C.addDays(d,1); if(!isOffDay(n)) return null;
  var w={s:'1400',e:'2100'}; if(C.parseTime(w.s)==null||C.parseTime(w.e)==null) return null;
  return {iso:n,s:w.s,e:w.e};
}
function resetOcWk(){ var d=$('ocDate').value; ocWkOn={}; if(!d) return; ocWkOn[d]=true; var n=C.addDays(d,1); ocWkOn[n]=friShift(d) ? false : (isOffDay(d) || (!!hol()[n] && !C.isWeekend(n))); ocWkOn['fri']=!!friShift(d); }
function renderOcWk(){} // weekend/PH shifts are applied automatically (no checkboxes shown)
function renderQuick(){
  var h=''; ["6","0","ph"].forEach(function(dw){ var w=DEFAULT_WK[dw]; if(w&&C.parseTime(w.s)!=null&&C.parseTime(w.e)!=null) h+='<button type="button" data-q="'+dw+'">'+WK_NAME[dw]+' '+w.s+'–'+w.e+'</button>'; });
  h+='<button type="button" data-q="n1">2100–2200</button><button type="button" data-q="n2">2300–0600</button><button type="button" data-q="n3">0600–0800</button>';
  var qe=$('oneQuick'); if(qe) qe.innerHTML=h;
}
if($('oneQuick')) $('oneQuick').addEventListener('click',function(ev){ var b=ev.target.closest('[data-q]'); if(!b) return; var q=b.dataset.q, se;
  if(q==='6'||q==='0'){ var w=DEFAULT_WK[q]; se=[w.s,w.e];
    var d=$('oneDate').value; if(d && String(C.isoToDate(d).getDay())!==q){ var dd=C.isoToDate(d); var diff=((+q)-dd.getDay()+7)%7; $('oneDate').value=C.addDays(d,diff); $('oneDate').onchange(); } }
  else if(q==='ph'){ se=[DEFAULT_WK.ph.s,DEFAULT_WK.ph.e]; }
  else se={n1:['2100','2200'],n2:['2300','0600'],n3:['0600','0800']}[q];
  $('oneS').value=se[0]; $('oneE').value=se[1]; updateOnePreview(); });

/* ---------- building entries ---------- */
function piecesFromOncall(){
  var d=$('ocDate').value; if(!d) return {err:'Pilih tarikh oncall.'};
  var hk0=$('ocHk0').getValue(), hk1=$('ocHk1').getValue();
  var out=[], bad=false;
  ocSegs.forEach(function(sg){
    var s=C.parseTime(sg.s), e=C.parseTime(sg.e); if(s==null||e==null||s===e){ bad=true; return; }
    var base=C.addDays(d, sg.off);
    C.splitSlot(base, sg.s, sg.e).forEach(function(p){
      var hk = p.date===d ? hk0 : (p.date===C.addDays(d,1) ? hk1 : autoHk(p.date,''));
      out.push({date:p.date,start:p.start,end:p.end,hakiki:hk});
    });
  });
  var f=friShift(d);
  if(f && ocWkOn['fri']) C.splitSlot(f.iso,f.s,f.e).forEach(function(p){ out.push({date:p.date,start:p.start,end:p.end,hakiki:p.date===C.addDays(d,1)?hk1:autoHk(p.date,'')}); });
  Object.keys(ocWkOn).forEach(function(iso){ if(iso==='fri'||!ocWkOn[iso]) return; var w=wkShift(iso); if(!w) return;
    C.splitSlot(iso,w.s,w.e).forEach(function(p){ out.push({date:p.date,start:p.start,end:p.end,hakiki:p.date===d?hk0:(p.date===C.addDays(d,1)?hk1:autoHk(p.date,''))}); }); });
  var seen={}; out=out.filter(function(p){ var k=p.date+p.start+p.end; if(seen[k]) return false; seen[k]=1; return true; });
  // OT cannot fall inside the day's normal working hours (waktu hakiki) on a working day
  var dropped=[]; out=out.filter(function(p){ if(isOffDay(p.date) || !overlapsHakiki(p)) return true; dropped.push(p); return false; });
  out=C.sortEntries(out);
  var note = dropped.length ? 'Tidak dimasukkan (dalam waktu hakiki): '+dropped.map(function(p){ return C.fmtDate(p.date).slice(0,5)+' '+p.start+'–'+p.end; }).join(', ') : '';
  if(bad) return {err:'Semak masa slot (format 4 digit, cth. 2100).', list:out};
  if(!out.length) return {err:'Tiada slot.'};
  return {list:out, note:note};
}
function piecesFromOne(){
  var d=$('oneDate').value, s=normTimeInput($('oneS')), e=normTimeInput($('oneE'));
  if(!d) return {err:'Pilih tarikh.'};
  if(!s||!e) return {err:'Isi masa mula dan tamat (cth. 2100).'};
  if(s===e) return {err:'Masa mula dan tamat sama.'};
  var hk=$('oneHk').getValue();
  return {list:C.splitSlot(d,s,e).map(function(p){ return {date:p.date,start:p.start,end:p.end,hakiki:p.date===d?hk:autoHk(p.date,hk),src:'one',jenis:lmJenis()}; })};
}
function overlapsHakiki(p){
  var m=String(p.hakiki||'').match(/^(\d{3,4})\s*[-–]\s*(\d{3,4})$/); if(!m) return false;
  var hs=C.parseTime(m[1]), he=C.parseTime(m[2]); if(hs==null||he==null||hs===he) return false; if(he<=hs) he+=1440;
  var ps=C.parseTime(p.start), pe=ps+C.durationMin(p.start,p.end);
  return Math.max(ps,hs)<Math.min(pe,he) || Math.max(ps+1440,hs)<Math.min(pe+1440,he);
}
function overlaps(a, list){
  var as=C.isoToDate(a.date).getTime()/60000+C.parseTime(a.start), ae=as+C.durationMin(a.start,a.end);
  return list.some(function(b){ if(b.id===a.id) return false; var bs=C.isoToDate(b.date).getTime()/60000+C.parseTime(b.start), be=bs+C.durationMin(b.start,b.end); return as<be && bs<ae; });
}
function renderPieces(el, res, msgEl){
  msgEl.innerHTML='';
  if(!res.list||!res.list.length){ el.innerHTML=''; if(res.err) msgEl.innerHTML='<div class="warn">'+esc(res.err)+'</div>'; return; }
  var all=allLoadedEntries();
  el.innerHTML=res.list.map(function(p){
    var k=C.classify(p.date,C.parseTime(p.start),hol()); var dup=overlaps(p,all);
    return '<div class="pvi">'+kBadge(k)+'<span class="d">'+C.fmtDate(p.date).slice(0,5)+' '+C.dayName(p.date)+'</span><span class="tm mono">'+p.start+'–'+p.end+' <span class="hint">· '+hm(C.durationMin(p.start,p.end))+'</span></span>'+(dup?'<span class="tag" style="background:#fff1f1;color:#9b1c1c">bertindih</span>':'')+'</div>';
  }).join('');
  if(res.err) msgEl.innerHTML='<div class="warn">'+esc(res.err)+'</div>';
  else if(res.note) msgEl.innerHTML='<div class="hint" style="margin-top:6px">'+esc(res.note)+'</div>';
}
function allLoadedEntries(){ var a=[]; Object.keys(S.months).forEach(function(k){ a=a.concat(S.months[k].entries); }); return a; }

function addEntries(list){
  var byMonth={}; list.forEach(function(p){ var m=ymOf(p.date); (byMonth[m]=byMonth[m]||[]).push(p); });
  return Promise.all(Object.keys(byMonth).map(function(m){
    return ensureMonth(m).then(function(md){
      byMonth[m].forEach(function(p){ var en={id:uid(),date:p.date,start:p.start,end:p.end,hakiki:p.hakiki,kadar:p.kadar||''}; if(p.src) en.src=p.src; if(p.jenis) en.jenis=p.jenis; md.entries.push(en); });
      schedule('m-'+m);
    });
  })).then(function(){
    var other=Object.keys(byMonth).filter(function(m){ return m!==S.ym; });
    renderMonth();
    toast(list.length+' slot ditambah'+(other.length?' (termasuk '+other.map(function(m){return C.monthLabel(m);}).join(', ')+')':''));
  });
}

/* ---------- oncall segs editor ---------- */
var ocSegs = [];
function renderSegs(){
  $('ocSegs').innerHTML = ocSegs.map(function(sg,i){
    return '<div class="seg" data-i="'+i+'"><select data-k="off"><option value="0"'+(sg.off==0?' selected':'')+'>Hari itu</option><option value="1"'+(sg.off==1?' selected':'')+'>Esok</option></select>'+
      '<input type="text" class="t" inputmode="numeric" maxlength="5" data-k="s" value="'+esc(sg.s)+'" placeholder="mula">'+
      '<span class="dash">–</span><input type="text" class="t" inputmode="numeric" maxlength="5" data-k="e" value="'+esc(sg.e)+'" placeholder="tamat">'+
      '<button class="iconbtn" data-del="'+i+'" aria-label="Buang slot">✕</button></div>';
  }).join('');
}
$('ocSegs').addEventListener('input',function(ev){ var t=ev.target, row=t.closest('.seg'); if(!row) return; var sg=ocSegs[+row.dataset.i];
  if(t.dataset.k==='off') sg.off=+t.value; else sg[t.dataset.k]=t.value.trim(); updateOcPreview(); });
$('ocSegs').addEventListener('change',function(ev){ var t=ev.target; if(t.dataset.k==='s'||t.dataset.k==='e'){ var row=t.closest('.seg'); var v=normTimeInput(t); if(v){ ocSegs[+row.dataset.i][t.dataset.k]=v; } updateOcPreview(); } });
$('ocSegs').addEventListener('click',function(ev){ var b=ev.target.closest('[data-del]'); if(!b) return; ocSegs.splice(+b.dataset.del,1); renderSegs(); updateOcPreview(); });
$('ocAddSeg').onclick=function(){ ocSegs.push({off:0,s:'',e:''}); renderSegs(); var ins=$('ocSegs').querySelectorAll('input'); ins[ins.length-2].focus(); };
$('ocSaveDef').onclick=function(){ var ok=ocSegs.every(function(s){ return C.parseTime(s.s)!=null&&C.parseTime(s.e)!=null; }); if(!ok||!ocSegs.length){ toast('Semak masa slot dahulu'); return; }
  S.main.segs=JSON.parse(JSON.stringify(ocSegs)); schedule('main'); toast('Slot lalai disimpan'); };
function updateOcPreview(){ renderPieces($('ocPv'), piecesFromOncall(), $('ocMsg')); }
function lmJenis(){ return S.main.lmJenis==='ANGIO'?'ANGIO':'KARDIAK'; }
function renderLmJenis(){ $('lmJenis').querySelectorAll('[data-j]').forEach(function(b){ b.classList.toggle('on', b.dataset.j===lmJenis()); }); }
$('lmJenis').addEventListener('click',function(ev){ var b=ev.target.closest('[data-j]'); if(!b) return; S.main.lmJenis=b.dataset.j; schedule('main'); renderLmJenis(); });
function updateOnePreview(){ var r=piecesFromOne(); if(!$('oneS').value&&!$('oneE').value) r={list:[]}; renderPieces($('onePv'), r, $('oneMsg')); }

/* ---------- oncall calendar ---------- */
var calYm=null;
function renderOcCal(){
  var sel=$('ocDate').value; if(!calYm) calYm=sel?ymOf(sel):ymOf(todayIso());
  var p=calYm.split('-'), y=+p[0], m=+p[1], H=hol(), today=todayIso();
  var md=S.months[calYm], has={}, onc={}, onc2={};
  if(md) md.entries.forEach(function(e){
    var st=C.fmtTime(C.parseTime(e.start));
    if(C.isOncallEntry(e,H) && (st==='2100'||st==='2300')) onc[e.date]=1;   // the oncall night itself
    else if(C.isOncallEntry(e,H)) onc2[e.date]=1;                            // the morning after (0600-0800 etc.)
    else if(!C.isOncallEntry(e,H)) has[e.date]=1;                            // lebih masa
  }); else ensureMonth(calYm).then(function(){ if(S.months[calYm]) renderOcCal(); });
  var first=new Date(y,m-1,1), lead=(first.getDay()+6)%7, days=new Date(y,m,0).getDate();
  var h='<div class="calh"><button type="button" data-cal="-1" aria-label="Bulan sebelum">‹</button><b>'+C.monthLabel(calYm)+'</b><button type="button" data-cal="1" aria-label="Bulan seterusnya">›</button></div><div class="calg">';
  ['Isn','Sel','Rab','Kha','Jum','Sab','Ahd'].forEach(function(w,i){ h+='<div class="wd'+(i>4?' we':'')+'">'+w+'</div>'; });
  for(var i=0;i<lead;i++) h+='<div class="pad"></div>';
  var phs=[];
  for(var d=1; d<=days; d++){
    var iso=calYm+'-'+C.pad2(d), cls='d';
    if(H[iso]){ cls+=' ph'; phs.push(C.fmtDate(iso).slice(0,5)+' '+esc(H[iso])); } else if(C.isWeekend(iso)) cls+=' wkd';
    if(onc[iso]) cls+=' onc'; else if(onc2[iso]) cls+=' onc2'; if(iso===sel) cls+=' sel'; if(iso===today) cls+=' today'; if(has[iso]) cls+=' has';
    h+='<button type="button" class="'+cls+'" data-d="'+iso+'"'+(H[iso]?' title="'+esc(H[iso])+'"':'')+'>'+d+'</button>';
  }
  h+='</div><div class="callg"><span><i class="lg-sel"></i>Dipilih</span><span><i class="lg-ph"></i>Cuti umum</span><span><i class="lg-wkd"></i>Hujung minggu</span><span><i class="lg-onc"></i>Oncall</span><span><i class="lg-onc2"></i>Esok oncall</span><span><i class="lg-lm"></i>Lebih masa</span></div>';
  if(phs.length) h+='<div class="calph">★ '+phs.join(' · ')+'</div>';
  $('ocCal').innerHTML=h;
}
$('ocCal').addEventListener('click',function(ev){
  var nb=ev.target.closest('[data-cal]');
  if(nb){ var p=calYm.split('-'), d=new Date(+p[0], +p[1]-1+(+nb.dataset.cal), 1); calYm=d.getFullYear()+'-'+C.pad2(d.getMonth()+1); renderOcCal(); return; }
  var b=ev.target.closest('[data-d]'); if(!b) return;
  $('ocDate').value=b.dataset.d; $('ocDate').onchange();
});
$('ocDate').onchange=function(){ var d=$('ocDate').value; if(d) calYm=ymOf(d); renderOcCal(); resetOcWk(); renderOcWk(); if(d){ $('ocHk0').setValue(autoHk(d,'0800-1400')); $('ocHk1').setValue(autoHk(C.addDays(d,1),'1400-2100')); } updateOcPreview(); };
$('oneDate').onchange=function(){ var d=$('oneDate').value; if(d && (hol()[d]||C.isWeekend(d))) $('oneHk').setValue(autoHk(d,'OFF DAY'));
  if(d && !$('oneS').value && !$('oneE').value){ var w=wkShift(d); if(w){ $('oneS').value=w.s; $('oneE').value=w.e; } } updateOnePreview(); };
['oneS','oneE'].forEach(function(id){ $(id).addEventListener('change',updateOnePreview); $(id).addEventListener('input',function(){ if($(id).value.replace(/\D/g,'').length>=4) updateOnePreview(); }); });

$('ocAdd').onclick=function(){
  var r=piecesFromOncall(); if(r.err){ updateOcPreview(); return; }
  var dups=r.list.filter(function(p){ return overlaps(p,allLoadedEntries()); });
  var go = dups.length ? confirmBox(dups.length+' slot bertindih dengan entri sedia ada. Tambah juga?') : Promise.resolve(true);
  go.then(function(ok){ if(!ok) return; rememberHk($('ocHk0').getValue()); rememberHk($('ocHk1').getValue());
    addEntries(r.list.map(function(p){ p.src='oc'; return p; })); });
};
$('oneAdd').onclick=function(){
  var r=piecesFromOne(); if(r.err){ renderPieces($('onePv'),r,$('oneMsg')); return; }
  var dups=r.list.filter(function(p){ return overlaps(p,allLoadedEntries()); });
  var go = dups.length ? confirmBox('Slot ini bertindih dengan entri sedia ada. Tambah juga?') : Promise.resolve(true);
  go.then(function(ok){ if(!ok) return; rememberHk($('oneHk').getValue()); addEntries(r.list).then(function(){ $('oneS').value=''; $('oneE').value=''; updateOnePreview(); }); });
};

/* tabs */
document.querySelectorAll('.tabs button').forEach(function(b){ b.onclick=function(){
  document.querySelectorAll('.tabs button').forEach(function(x){ x.classList.toggle('on',x===b); });
  $('tab-oc').hidden = b.dataset.tab!=='oc'; $('tab-one').hidden = b.dataset.tab!=='one'; }; });

/* main view switcher (zero-scroll nav) */
function setView(v){
  var m=$('appMain'); if(!m) return;
  m.dataset.view=v;
  if($('appNav')) $('appNav').querySelectorAll('button[data-view]').forEach(function(b){
    var on = b.dataset.view===v || (v==='list' && b.dataset.view==='add' && window.innerWidth>=880);
    b.classList.toggle('on', on);
  });
}
if($('appNav')) $('appNav').addEventListener('click',function(ev){
  var b=ev.target.closest('button[data-view]'); if(!b) return;
  setView(b.dataset.view);
});

/* ---------- month view ---------- */
function curEntries(){ return (S.months[S.ym]||{entries:[]}).entries.filter(function(e){ return ymOf(e.date)===S.ym; }); }

function renderSummary(layout){
  var mins=layout.grand, h=Math.floor(mins/60), m=mins%60;
  $('sumTotal').innerHTML=h+(m?'<small>j</small> '+m+'<small>m</small>':'<small> jam</small>');
  var eq=0;
  $('sumChips').innerHTML = C.KADAR.filter(function(k){ return layout.totals[k]; }).map(function(k){
    eq += layout.totals[k]/60*parseFloat(C.KADAR_INFO[k].r);
    return '<span class="chip">'+kBadge(k)+hm(layout.totals[k])+'</span>'; }).join('') || '<span class="hint">Belum ada entri bulan ini</span>';
  var n=layout.rows.length; $('rowsBar').style.width=Math.min(100,n/31*100)+'%'; $('rowsBar').style.background = n>31?'var(--bad)':'var(--navy)';
  $('rowsInfo').textContent=n+' / 31 baris borang digunakan';
  $('eqInfo').textContent = eq? ('Jam setara ×kadar: '+eq.toFixed(2)) : '';
  renderCalc(layout);
}
function rm(n){ return 'RM '+n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function parseGaji(v){ var n=parseFloat(String(v||'').replace(/[^0-9.]/g,'')); return isFinite(n)&&n>0 ? n : 0; }
function renderCalc(layout){
  var g=parseGaji(S.main.gaji), out=$('calcOut'), pill=$('calcPill');
  if(!g){
    if(pill){ pill.textContent=''; pill.className='calcpill'; }
    out.innerHTML='<p class="hint" style="margin:8px 0 0">Masukkan gaji pokok untuk kira anggaran tuntutan bulan ini dan semak had 1/3 gaji.</p>';
    return;
  }
  var hr=g*12/(313*8), total=0, rows='';
  C.KADAR.forEach(function(k){ var mins=layout.totals[k]; if(!mins) return; var f=parseFloat(C.KADAR_INFO[k].r);
    var amt=Math.round(hr*f*mins/60*100)/100; total+=amt;
    rows+='<tr><td>'+kBadge(k)+'</td><td>'+hm(mins)+' × '+C.KADAR_INFO[k].r+'</td><td class="r">'+rm(amt)+'</td></tr>'; });
  total=Math.round(total*100)/100;
  var t1=Math.round(g/3*100)/100, t2=Math.round(g*2/3*100)/100, pct=t1?total/t1*100:0;
  if(pill){
    pill.textContent=rm(total)+' · '+pct.toFixed(0)+'%';
    pill.className='calcpill '+(total>t1?'bad':pct>=90?'mid':total>0?'ok':'');
  }
  var h='<table class="ctab"><tr><td colspan="2" class="hint">Kadar sejam = '+rm(g)+' × 12 ÷ (313 × 8)</td><td class="r">'+rm(Math.round(hr*100)/100)+'</td></tr>'+rows+
    '<tr class="tot"><td colspan="2">Jumlah tuntutan</td><td class="r">'+rm(total)+'</td></tr></table>'+
    '<div class="lims"><div class="lim"><span>Gaji pokok</span><b>'+rm(g)+'</b></div><div class="lim"><span>1/3 gaji (had)</span><b>'+rm(t1)+'</b></div><div class="lim"><span>2/3 gaji</span><b>'+rm(t2)+'</b></div></div>'+
    '<div class="capbar"><i style="width:'+Math.min(100,pct)+'%;background:'+(pct>100?'var(--bad)':pct>=90?'var(--yellow)':'var(--ok)')+'"></i></div>'+
    '<div class="rowsinfo"><span>'+pct.toFixed(1)+'% daripada had 1/3 gaji</span><span>'+(total<=t1?'Baki: '+rm(Math.round((t1-total)*100)/100):'')+'</span></div>';
  if(total>t1) h+='<div class="alert bad"><span>⚠</span><span>Tuntutan '+rm(total)+' MELEBIHI had 1/3 gaji ('+rm(t1)+') sebanyak '+rm(Math.round((total-t1)*100)/100)+'. Kurangkan slot yang dituntut, atau dapatkan kelulusan Ketua Jabatan / tuntut lebihan sebagai cuti gantian.</span></div>';
  else if(pct>=90) h+='<div class="alert mid"><span>!</span><span>Tuntutan menghampiri had 1/3 gaji.</span></div>';
  else if(total>0) h+='<div class="alert ok"><span>✓</span><span>Tuntutan dalam had 1/3 gaji.</span></div>';
  out.innerHTML=h;
}
var gajiT;
$('gaji').addEventListener('input',function(){ S.main.gaji=$('gaji').value.trim(); clearTimeout(gajiT); gajiT=setTimeout(function(){ schedule('main'); },500); renderCalc(C.buildLayout(curEntries(),hol())); if(!S.editId) renderList(); });
$('gaji').addEventListener('change',function(){ var g=parseGaji($('gaji').value); if(g){ $('gaji').value=g.toFixed(2); S.main.gaji=$('gaji').value; schedule('main'); } });

function renderList(){
  var list=C.sortEntries(curEntries());
  $('listLbl').textContent=C.monthLabel(S.ym).toLowerCase().replace(/(^|\s)\S/g,function(c){return c.toUpperCase();});
  $('delAll').hidden = !list.length;
  var nc=$('navCnt'); if(nc){ nc.textContent=list.length; nc.hidden=!list.length; }
  if(!list.length){ $('list').innerHTML='<div class="empty">Tiada oncall direkod untuk '+C.monthLabel(S.ym)+'.<br>Tambah di atas — kadar dan jam dikira automatik.</div>'; return; }
  var byDay={}, order=[]; list.forEach(function(e){ if(!byDay[e.date]){ byDay[e.date]=[]; order.push(e.date); } byDay[e.date].push(e); });
  var h='';
  var gj=parseGaji(S.main.gaji), hrRate=gj?gj*12/(313*8):0;
  order.forEach(function(d){
    h+='<div class="day"><div class="dayh"><b>'+C.fmtDate(d)+'</b><span>'+C.dayName(d)+'</span>'+dayTag(d)+(hol()[d]?'<span class="hint">'+esc(hol()[d])+'</span>':(rawHol()[d]?'<span class="hint">'+esc(rawHol()[d])+' – PH dianjak ke '+C.fmtDate(computeHol().moved[d]).slice(0,5)+'</span>':''))+'</div>';
    byDay[d].forEach(function(e){
      var auto=C.classify(e.date,C.parseTime(e.start),hol()), k=e.kadar||auto;
      if(S.editId===e.id){
        h+='<div class="edit" data-id="'+e.id+'"><div class="grid g3"><label class="f">Tarikh<input type="date" data-f="date" value="'+e.date+'"></label>'+
          '<label class="f">Mula<input type="text" class="t" inputmode="numeric" maxlength="5" data-f="start" value="'+e.start+'"></label>'+
          '<label class="f">Tamat<input type="text" class="t" inputmode="numeric" maxlength="5" data-f="end" value="'+e.end+'"></label></div>'+
          '<label class="f" style="margin-top:8px">Waktu hakiki<div class="hk" data-hk="1"></div></label>'+
          '<div style="display:flex;gap:8px;margin-top:10px;justify-content:space-between"><button class="btn ghost" data-act="del">Padam</button><span style="display:flex;gap:8px"><button class="btn ghost" data-act="cancel">Batal</button><button class="btn pri" data-act="save">Simpan</button></span></div></div>';
      } else {
        var opts='<option value="">'+auto+' (auto)</option>'+C.KADAR.map(function(x){ return '<option value="'+x+'"'+(e.kadar===x?' selected':'')+'>'+x+' · '+C.KADAR_INFO[x].r+'</option>'; }).join('');
        h+='<div class="ent" data-id="'+e.id+'"><div><span class="tm">'+e.start+'–'+e.end+'</span><span class="du">'+hm(C.durationMin(e.start,e.end))+'</span>'+
          '<span class="hkl">Hakiki: '+(esc((hol()[e.date]&&/^OFF( DAY)?$/i.test(e.hakiki||''))?'PH':e.hakiki)||'—')+(e.jenis?'<span class="jn">'+esc(e.jenis)+'</span>':'')+'</span></div>'+
          '<div class="kc"><select class="ksel k'+k+' '+(e.kadar?'man':'auto')+'" data-kadar="1" title="'+esc(C.KADAR_INFO[k].t)+'">'+opts+'</select>'+
          (hrRate?'<span class="amt">'+rm(Math.round(hrRate*parseFloat(C.KADAR_INFO[k].r)*C.durationMin(e.start,e.end)/60*100)/100)+'</span>':'')+'</div>'+
          '<button class="iconbtn" data-act="edit" aria-label="Ubah">✎</button><button class="iconbtn" data-act="del" aria-label="Padam">🗑</button></div>';
      }
    });
    h+='</div>';
  });
  $('list').innerHTML=h;
  // show selected text as the letter only
  $('list').querySelectorAll('select.ksel').forEach(function(s){ var o=s.options[s.selectedIndex]; s.dataset.full=o.text; });
  var ed=$('list').querySelector('.edit');
  if(ed){ var e=findEntry(ed.dataset.id); buildHk(ed.querySelector('[data-hk]'), e.hakiki); }
}
$('delAll').onclick=function(){
  var n=curEntries().length; if(!n) return;
  confirmBox('Padam semua '+n+' slot bagi '+C.monthLabel(S.ym)+'? Tindakan ini tidak boleh dibatalkan.','Ya, padam semua').then(function(ok){
    if(!ok) return; var md=S.months[S.ym]; md.entries=md.entries.filter(function(e){ return ymOf(e.date)!==S.ym; });
    S.editId=null; schedule('m-'+S.ym); renderMonth(); toast(n+' slot dipadam'); });
};
function findEntry(id){ return curEntries().filter(function(e){ return e.id===id; })[0]; }
function removeEntry(id){ var md=S.months[S.ym]; md.entries=md.entries.filter(function(e){ return e.id!==id; }); schedule('m-'+S.ym); }

$('list').addEventListener('change',function(ev){
  var s=ev.target; if(!s.dataset.kadar) return; var id=s.closest('[data-id]').dataset.id, e=findEntry(id); e.kadar=s.value; schedule('m-'+S.ym); renderMonth();
});
$('list').addEventListener('click',function(ev){
  var b=ev.target.closest('[data-act]'); if(!b) return; var box=b.closest('[data-id]'), id=box.dataset.id, act=b.dataset.act;
  if(act==='edit'){ S.editId=id; renderList(); return; }
  if(act==='cancel'){ S.editId=null; renderList(); return; }
  if(act==='del'){ var e=findEntry(id); confirmBox('Padam slot '+C.fmtDate(e.date)+' '+e.start+'–'+e.end+'?','Ya, padam').then(function(ok){ if(!ok) return; removeEntry(id); S.editId=null; renderMonth(); toast('Slot dipadam'); }); return; }
  if(act==='save'){
    var d=box.querySelector('[data-f=date]').value, si=box.querySelector('[data-f=start]'), ei=box.querySelector('[data-f=end]');
    var s=normTimeInput(si), en=normTimeInput(ei), hk=box.querySelector('[data-hk]').getValue();
    if(!d||!s||!en||s===en){ toast('Semak tarikh dan masa'); return; }
    var old=findEntry(id); removeEntry(id); S.editId=null; rememberHk(hk);
    addEntries(C.splitSlot(d,s,en).map(function(p){ var q={date:p.date,start:p.start,end:p.end,hakiki:hk,kadar:old.kadar}; if(old.src) q.src=old.src; if(old.jenis) q.jenis=old.jenis; return q; }));
  }
});

function renderPreview(layout){
  var head='<tr><th rowspan="2">BIL</th><th rowspan="2">TARIKH</th><th rowspan="2">HARI</th><th colspan="2">TEMPOH</th><th colspan="2">JUMLAH MASA</th><th colspan="5">KADAR</th><th rowspan="2">KETERANGAN</th><th colspan="2">WAKTU KERJA HAKIKI</th></tr>'+
    '<tr><th>MULA</th><th>TAMAT</th><th>JAM</th><th>MINIT</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>MULA</th><th>TAMAT</th></tr>';
  var KET=ketAll(layout);
  var body='';
  for(var i=0;i<31;i++){
    var r=layout.rows[i]||{c:{}}; var c=r.c;
    body+='<tr class="'+(r.bold?'tot':'')+'"><td>'+(i+1)+'</td>';
    for(var col=1;col<=14;col++){
      if(col===12) { body+='<td class="ket">'+(KET[i]||'')+'</td>'; continue; }
      body+='<td>'+esc(c[col]||'')+'</td>';
    }
    body+='</tr>';
  }
  $('pvTable').innerHTML=head+body;
}

function renderMonth(){
  $('mLbl').textContent=C.monthLabel(S.ym); if(calYm) renderOcCal();
  var layout=C.buildLayout(curEntries(),hol());
  renderSummary(layout); renderList(); renderPreview(layout);
  $('genMsg').innerHTML = layout.overflow ? '<div class="warn err">Borang hanya ada 31 baris; bulan ini perlukan '+layout.rows.length+'. Gabungkan slot berturutan atau buang yang tidak dituntut.</div>' : '';
  updateOcPreview(); updateOnePreview();
}
function goMonth(delta){
  var p=S.ym.split('-'), d=new Date(+p[0], +p[1]-1+delta, 1); S.ym=d.getFullYear()+'-'+C.pad2(d.getMonth()+1); S.editId=null;
  $('mLbl').textContent=C.monthLabel(S.ym);
  ensureMonth(S.ym).then(renderMonth);
  var first=S.ym+'-01'; if(ymOf($('ocDate').value)!==S.ym){ $('ocDate').value = ymOf(todayIso())===S.ym?todayIso():first; $('ocDate').onchange(); }
  if(ymOf($('oneDate').value)!==S.ym){ $('oneDate').value = ymOf(todayIso())===S.ym?todayIso():first; }
}
$('mPrev').onclick=function(){ goMonth(-1); }; $('mNext').onclick=function(){ goMonth(1); };

/* ---------- weekend shift settings ---------- */
function renderWkSettings(){ ['6','0','ph'].forEach(function(dw){ var w=(S.main.wk||{})[dw]||{s:'',e:''}; $('wk'+dw+'s').value=w.s||''; $('wk'+dw+'e').value=w.e||''; });
  var f=S.main.friShift||{s:'1400',e:'2100'}; $('frs').value=f.s||''; $('fre').value=f.e||''; }
['s','e'].forEach(function(k){ var el=$('fr'+k); el.addEventListener('change',function(){ var v=el.value.trim()?normTimeInput(el):''; if(v===null) return;
  S.main.friShift=Object.assign({s:'1400',e:'2100'},S.main.friShift||{}); S.main.friShift[k]=v; schedule('main'); resetOcWk(); renderOcWk(); updateOcPreview(); }); });
['6','0','ph'].forEach(function(dw){ ['s','e'].forEach(function(k){ var el=$('wk'+dw+k);
  el.addEventListener('change',function(){ var v=el.value.trim()?normTimeInput(el):''; if(v===null) return; S.main.wk=S.main.wk||{}; S.main.wk[dw]=S.main.wk[dw]||{s:'',e:''}; S.main.wk[dw][k]=v; schedule('main'); renderQuick(); resetOcWk(); renderOcWk(); updateOcPreview(); }); }); });

/* ---------- profile & holidays ---------- */
var PF={pNama:'nama',pTel:'tel',pPekerja:'pekerja',pAlamat:'alamat',pJabatan:'jabatan'};
function renderProfile(){ Object.keys(PF).forEach(function(id){ $(id).value=S.main.profile[PF[id]]||''; }); $('gaji').value=S.main.gaji||'';
  if(!S.main.profile.nama) $('profBox').open=true; }
Object.keys(PF).forEach(function(id){ $(id).addEventListener('input',function(){ S.main.profile[PF[id]]=$(id).value; schedule('main'); }); });

function renderHolidays(){
  var hl=$('holList'); if(!hl) return;
  var raw=rawHol(), H=computeHol(), yr=S.ym.slice(0,4);
  // remember which year groups are open across re-renders
  var openYrs={}; hl.querySelectorAll('details[data-y]').forEach(function(d){ openYrs[d.dataset.y]=d.open; });
  var keys=Object.keys(raw);
  // auto replacement days that are not in the raw list
  var autoT={}; Object.keys(H.moved).forEach(function(src){ var t=H.moved[src]; if(!raw[t]){ autoT[t]=src; keys.push(t); } });
  keys.sort();
  var years={}; keys.forEach(function(k){ (years[k.slice(0,4)]=years[k.slice(0,4)]||[]).push(k); });
  if(!years[yr]) years[yr]=[];
  var row = function(k){
    var dn='<span class="dt">'+C.fmtDate(k).slice(0,5)+'</span><span class="hint" style="min-width:34px">'+C.dayName(k).slice(0,3)+'</span>';
    if(autoT[k]) return '<div class="hol auto">'+dn+'<span class="nm">'+esc(H.map[k])+' <span class="tag ph">auto</span></span></div>';
    if(H.moved[k]) return '<div class="hol moved">'+dn+'<span class="nm"><s>'+esc(raw[k])+'</s><br><span class="hint">Jatuh '+C.dayName(k).toLowerCase()+' – tidak dikira PH, dianjak ke '+C.fmtDate(H.moved[k])+' ('+C.dayName(H.moved[k]).slice(0,3)+')</span></span><button class="iconbtn" data-h="'+k+'" aria-label="Buang">✕</button></div>';
    return '<div class="hol">'+dn+'<span class="nm">'+esc(raw[k])+'</span>'+(/^Cuti ganti/i.test(raw[k])?'':'<button class="linkbtn" data-g="'+k+'" title="Tambah cuti ganti pada hari bekerja berikutnya">Ganti →</button>')+'<button class="iconbtn" data-h="'+k+'" aria-label="Buang">✕</button></div>';
  };
  hl.innerHTML = Object.keys(years).sort().map(function(y){
    var ks=years[y], ph=ks.filter(function(k){ return H.map[k]; }).length;
    var open = (y in openYrs) ? openYrs[y] : (y===yr);
    return '<details class="hyr" data-y="'+y+'"'+(open?' open':'')+'><summary><span>'+y+' <span class="hint" style="font-weight:600">· '+ph+' hari dikira PH</span></span></summary>'+
      (ks.length ? ks.map(row).join('') : '<div class="hint" style="padding:6px 0">Tiada cuti umum untuk '+y+'. Tambah di atas.</div>')+'</details>';
  }).join('');
}
function nextWorkday(iso){ var d=C.addDays(iso,1); while(C.isWeekend(d)||hol()[d]) d=C.addDays(d,1); return d; }
if($('holList')) $('holList').addEventListener('click',function(ev){
  var g=ev.target.closest('[data-g]');
  if(g){ var src=g.dataset.g, nd=nextWorkday(src), nm=rawHol()[src];
    confirmBox('Tambah cuti ganti "'+nm+'" pada '+C.fmtDate(nd)+' ('+C.dayName(nd)+')?','Ya, tambah').then(function(ok){ if(!ok) return;
      S.main.holidays[nd]='Cuti ganti '+nm; schedule('main'); renderHolidays(); renderMonth(); toast('Cuti ganti ditambah: '+C.fmtDate(nd)); });
    return; }
  var b=ev.target.closest('[data-h]'); if(!b) return; delete S.main.holidays[b.dataset.h]; schedule('main'); renderHolidays(); renderMonth(); });
function renderShift(){ var sd=shiftDays(); ['0','6'].forEach(function(dw){ var el=$('sh'+dw); if(!el) return; el.checked=!!sd[dw]; el.closest('label').classList.toggle('off',!sd[dw]); }); }
['0','6'].forEach(function(dw){ var el=$('sh'+dw); if(!el) return; el.addEventListener('change',function(){ var sd=Object.assign({},shiftDays()); sd[dw]=el.checked; S.main.shiftDays=sd; schedule('main'); renderShift(); renderHolidays(); renderMonth(); }); });
if($('hAdd')) $('hAdd').onclick=function(){ var d=$('hDate').value, n=$('hName').value.trim()||'Cuti umum'; if(!d){ toast('Pilih tarikh cuti'); return; }
  S.main.holidays[d]=n; schedule('main'); $('hDate').value=''; $('hName').value=''; renderHolidays(); renderMonth(); toast('Cuti umum ditambah'); };

if($('kTable')) $('kTable').innerHTML=C.KADAR.map(function(k){ return '<tr><td>'+kBadge(k)+'</td><td class="mono"><b>'+C.KADAR_INFO[k].r+'</b></td><td>'+C.KADAR_INFO[k].t+'</td></tr>'; }).join('');

/* ---------- keterangan editor ---------- */
function renderKet(){ $('ketTxt').value=ketLines().join('\n').replace(/\n+$/,''); $('ketPreset').value=ketPresetOf(); ketInfo(); }
function ketInfo(){ var L=ketLines(), long=L.filter(function(l){ return l.length>22; }).length, def=(L.join('\n')===DEFAULT_KET.join('\n'));
  $('ketInfo').textContent=L.filter(function(l){return l;}).length+' baris'+(def?' · teks asal':' · diubah')+(long?' · '+long+' baris panjang (mungkin dikecilkan)':''); }
var ketT;
$('ketTxt').addEventListener('input',function(){ S.main.ket=$('ketTxt').value; $('ketPreset').value=ketPresetOf(); ketInfo(); clearTimeout(ketT); ketT=setTimeout(function(){ schedule('main'); renderMonth(); },400); });
$('ketPreset').onchange=function(){ var k=$('ketPreset').value;
  if(k==='custom'){ $('ketTxt').focus(); return; }
  if(k==='hctm') delete S.main.ket; else S.main.ket=KET_PRESETS[k].join('\n');
  schedule('main'); renderKet(); renderMonth(); toast('Keterangan borang dikemas kini'); };
$('ketReset').onclick=function(){ delete S.main.ket; schedule('main'); renderKet(); renderMonth(); toast('Teks keterangan asal dipulihkan'); };

/* ---------- backup & restore ---------- */
function exportBackup(){
  var data={};
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(k && k.indexOf('oncall:')===0){
        var v=lsGet(k);
        if(v!=null) data[k]=v;
      }
    }
  }catch(e){}
  if(!Object.keys(data).length){ toast('Tiada data untuk disandarkan'); return; }
  var payload={app:'radiologyoncall',version:1,exportedAt:new Date().toISOString(),data:data};
  var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  saveBlob('BACKUP_ONCALL_'+todayIso()+'.json', blob, 'Fail sandaran dimuat turun');
}
if($('bkExport')) $('bkExport').onclick=exportBackup;
if($('bkImport')) $('bkImport').onclick=function(){ $('bkFile').value=''; $('bkFile').click(); };
if($('bkFile')) $('bkFile').addEventListener('change',function(ev){
  var file=ev.target.files && ev.target.files[0]; if(!file) return;
  var reader=new FileReader();
  reader.onload=function(){
    var parsed;
    try{ parsed=JSON.parse(reader.result); }catch(e){ toast('Fail sandaran tidak sah'); return; }
    var data=(parsed && parsed.data && typeof parsed.data==='object') ? parsed.data : parsed;
    var keys=Object.keys(data||{}).filter(function(k){ return k.indexOf('oncall:')===0; });
    if(!keys.length){ toast('Tiada data Tuntutan Oncall ditemui dalam fail ini'); return; }
    confirmBox('Pulihkan sandaran daripada "'+file.name+'"? Data sedia ada dalam peranti ini akan digantikan.','Ya, pulihkan').then(function(ok){
      if(!ok) return;
      try{
        var old=[]; for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k && k.indexOf('oncall:')===0) old.push(k); }
        old.forEach(function(k){ localStorage.removeItem(k); });
        keys.forEach(function(k){ lsSet(k, data[k]); });
      }catch(e){ toast('Gagal menyimpan data sandaran'); return; }
      S.main=defaultMain(); applyMain(lsGet('oncall:main'));
      S.months={};
      var lm=lsGet('oncall:m-'+S.ym); S.months[S.ym]=lm&&lm.entries?lm:{entries:[],updatedAt:0};
      S.editId=null;
      refreshAfterLoad();
      setSave('Disimpan dalam peranti ✓');
      toast('Sandaran berjaya dipulihkan ('+keys.length+' rekod)');
    });
  };
  reader.readAsText(file);
});

/* ---------- wipe everything ---------- */
$('wipeAll').onclick=function(){
  confirmBox('Padam SEMUA data? Semua slot bagi semua bulan, maklumat pemohon, gaji pokok dan tetapan akan dipadam. Tindakan ini tidak boleh dibatalkan.','Ya, padam semua').then(function(ok){
    if(!ok) return;
    var btn=$('wipeAll'); btn.disabled=true;
    try{ var ks=[]; for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k && k.indexOf('oncall:')===0) ks.push(k); } ks.forEach(function(k){ localStorage.removeItem(k); }); }catch(e){}
    S.main=defaultMain(); S.months={}; S.months[S.ym]={entries:[],updatedAt:0}; S.editId=null;
    $('gaji').value='';
    refreshAfterLoad(); setSave('Disimpan dalam peranti ✓');
    btn.disabled=false; toast('Semua data dipadam');
  });
};

/* ---------- generate docx / pdf ---------- */
function genPrep(){
  var layout=C.buildLayout(curEntries(),hol());
  if(!layout.rows.length){ toast('Tiada entri untuk bulan ini'); return null; }
  if(layout.overflow){ toast('Melebihi 31 baris borang'); return null; }
  var p=S.main.profile;
  if(!p.nama){ setView('set'); $('profBox').open=true; $('pNama').focus(); toast('Isi maklumat pemohon dahulu'); return null; }
  var gd=$('genDate').value||todayIso();
  return {layout:layout, info:{ket:ketAll(layout), nama:p.nama.toUpperCase(),tel:p.tel||'',pekerja:(p.pekerja||'').toUpperCase(),alamat:(p.alamat||'').toUpperCase(),jabatan:(p.jabatan||'').toUpperCase(),bulan:C.monthLabel(S.ym),tarikh:C.fmtDate(gd)}};
}
function saveBlob(fname, blob, msg){
  try{
    var url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download=fname; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },4000);
    toast(msg || ('Borang '+fname+' dimuat turun'));
  }catch(e){
    $('genMsg').innerHTML='<div class="warn">Muat turun tidak tersedia dalam paparan ini.</div>';
  }
  return Promise.resolve();
}
function safeFileName(name){
  return String(name||'').trim().replace(/[\\/:*?"<>|\x00-\x1f]+/g,' ').replace(/\s+/g,' ').replace(/\.+$/,'').trim();
}
function fileBase(){
  var nm=safeFileName(S.main.profile&&S.main.profile.nama).toUpperCase();
  return 'CLAIM ONCALL_'+C.monthLabel(S.ym)+(nm?'_'+nm:'');
}
function buildDocx(g){
  return loadTpl().then(function(T){
    var z=new JSZip();
    T.order.forEach(function(path){
      if(path==='word/document.xml') z.file(path, C.fillDocumentXml(T.t[path],g.info,g.layout));
      else if(T.t[path]!=null) z.file(path,T.t[path]);
      else z.file(path,T.b[path],{base64:true});
    });
    return z.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  });
}
// PDF: blank form pages as background, data drawn at measured cell positions (pt, A4)
var PDF_COLX={1:81.9,2:125.4,3:162.05,4:199.2,5:234.45,6:267.45,7:292.2,8:308.7,9:325.2,10:341.68,11:358.18,13:508.93,14:549.43};
var PDF_COLW={1:42,2:42,3:35,4:35,5:33,6:32,7:15,8:15,9:15,10:15,11:15,13:38,14:38};
function pdfRowY(r){ return 305.12+(r-1)*13.5; }
function buildPdf(g){
  var JS=window.jspdf&&window.jspdf.jsPDF; if(!JS) return Promise.reject('nolib');
  return loadPdfBg().then(function(bg){
    var doc=new JS({unit:'pt',format:'a4',compress:true});
    var W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight();
    doc.addImage(bg.p1,'PNG',0,0,W,H,'bg1','FAST');
    doc.setTextColor(0,0,0);
    function put(t,x,y,maxW,size,bold,align){ if(t==null||t==='') return; t=String(t);
      doc.setFont('helvetica',bold?'bold':'normal'); var fs=size; doc.setFontSize(fs);
      while(fs>6 && doc.getTextWidth(t)>maxW){ fs-=0.25; doc.setFontSize(fs); }
      doc.text(t,x,y,{align:align||'center',baseline:'middle'}); }
    var inf=g.info;
    put(inf.nama,198,144.58,365,10,false,'left');
    put(inf.tel,198,163.23,365,10,false,'left');
    put(inf.pekerja,198,180.48,210,10,false,'left');
    put(inf.alamat,198,195.58,210,10,false,'left');
    put(inf.bulan,451,180.48,113,10,false,'left');
    put(inf.jabatan,451,204.08,113,10,false,'left');
    put(inf.tarikh,80,775.53,120,9.5,false,'left');
    (inf.ket||[]).forEach(function(t,i){ if(t && i<31) put(t,426.82,pdfRowY(i+1)+0.66,108,8.3,true); });
    for(var r=1;r<=31;r++){ var row=g.layout.rows[r-1]; if(!row) break;
      Object.keys(PDF_COLX).forEach(function(c){ put(row.c[c],PDF_COLX[c],pdfRowY(r),PDF_COLW[c],8.5,row.bold); }); }
    doc.addPage(); doc.addImage(bg.p2,'PNG',0,0,W,H,'bg2','FAST');
    doc.setProperties({title:'Borang Tuntutan Elaun Kerja Lebih Masa – '+inf.bulan, subject:'Tuntutan oncall', creator:'Tuntutan Oncall'});
    return doc.output('blob');
  });
}
function runGen(kind){
  var g=genPrep(); if(!g) return;
  if(kind==='docx' && typeof JSZip==='undefined'){ toast('Pustaka zip belum dimuatkan, cuba lagi'); return; }
  if(kind==='pdf' && !(window.jspdf&&window.jspdf.jsPDF)){ toast('Pustaka PDF belum dimuatkan, cuba lagi'); return; }
  var btn=$(kind==='pdf'?'genPdf':'genBtn'), origTxt=btn.textContent;
  btn.disabled=true; btn.textContent='Menjana…';
  (kind==='pdf'?buildPdf(g):buildDocx(g)).then(function(blob){ return saveBlob(fileBase()+(kind==='pdf'?'.pdf':'.docx'), blob); })
    .catch(function(){ toast('Gagal menjana borang – pastikan template.json & pdfbg.json ada dalam repo'); })
    .then(function(){ btn.disabled=false; btn.textContent=origTxt; });
}
$('genBtn').onclick=function(){ runGen('docx'); };
$('genPdf').onclick=function(){ runGen('pdf'); };

/* ---------- init ---------- */
function applyMain(m){ if(!m) return; S.main=Object.assign(S.main,m); if(!S.main.segs||!S.main.segs.length) S.main.segs=DEFAULT_SEGS.slice(); if(!S.main.wk) S.main.wk=JSON.parse(JSON.stringify(DEFAULT_WK)); if(!S.main.wk.ph) S.main.wk.ph={s:'0800',e:'1400'};
  if((m.segv||1)<2){ S.main.segs=(S.main.segs||[]).filter(function(g){ return !(+g.off===1 && g.s==='1400' && g.e==='2100'); }); if(!S.main.segs.length) S.main.segs=DEFAULT_SEGS.slice(); S.main.segv=2; }
  // v2: Ahad & PH shift changed from 1400-2100 to 0800-1400 (only if still on the old default)
  if((m.wkv||1)<2){ ['0','ph'].forEach(function(k){ var w=S.main.wk[k]; if(w && w.s==='1400' && w.e==='2100') S.main.wk[k]={s:'0800',e:'1400'}; }); S.main.wkv=2; } }
function bootUi(){
  S.ym = S.ym || ymOf(todayIso());
  ocSegs = JSON.parse(JSON.stringify(DEFAULT_SEGS));
  buildHk($('ocHk0'),'0800-1400',updateOcPreview); buildHk($('ocHk1'),'1400-2100',updateOcPreview); buildHk($('oneHk'),'0800-1400',updateOnePreview);
  $('ocDate').value=todayIso(); $('oneDate').value=todayIso(); $('genDate').value=todayIso();
  $('ocDate').onchange(); renderSegs(); renderProfile(); renderHolidays(); renderShift(); renderWkSettings(); renderQuick(); renderKet(); renderLmJenis();
}
function refreshAfterLoad(){
  ocSegs = JSON.parse(JSON.stringify(DEFAULT_SEGS)); renderSegs(); renderProfile(); renderHolidays(); renderShift(); renderWkSettings(); renderQuick(); renderKet(); renderLmJenis();
  buildHk($('ocHk0'),$('ocHk0').getValue(),updateOcPreview); buildHk($('ocHk1'),$('ocHk1').getValue(),updateOcPreview); buildHk($('oneHk'),$('oneHk').getValue(),updateOnePreview);
  $('ocDate').onchange(); renderMonth();
}

applyMain(lsGet('oncall:main'));
S.ym = ymOf(todayIso());
var lm = lsGet('oncall:m-'+S.ym); S.months[S.ym] = lm && lm.entries ? lm : {entries:[],updatedAt:0};
bootUi(); renderMonth(); setSave('Disimpan dalam peranti ✓');
})();
