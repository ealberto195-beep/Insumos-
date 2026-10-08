'use strict';
/* Grupo Didans · Inventario piloto. Sin servicios externos ni sincronización. */
const STORAGE_KEY = 'didans-inventario-piloto-v1';
const MOVEMENT_LABELS = {inicial:'Saldo inicial', entrada:'Entrada', salida:'Salida', merma:'Merma', ajuste:'Ajuste físico'};
const $ = id => document.getElementById(id);
const today = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const monthNow = () => today().slice(0,7);
const cash = n => Number(n||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const number = n => Number(n||0).toLocaleString('es-MX',{maximumFractionDigits:3});
const roundQty = n => Math.round((Number(n)+Number.EPSILON)*1000)/1000;
const moneyNum = n => Math.round((Number(n)+Number.EPSILON)*100)/100;
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const generateId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const persisted = (()=>{try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY));return x && Array.isArray(x.products)&&Array.isArray(x.movements)?x:{products:[],movements:[]}}catch{return {products:[],movements:[]}}})();
let state = persisted;
let editingId = null;
let restoreCandidate = null;
let toastTimer;

function toast(msg,error=false){const el=$('toast');el.textContent=msg;el.classList.toggle('error',error);el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true},4500)}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));return true}catch(e){toast('No se pudo guardar. Verifica el espacio del navegador y descarga un respaldo.',true);return false}}
function productById(id){return state.products.find(p=>p.id===id)}
function productStock(id){return roundQty(state.movements.filter(m=>m.productId===id).reduce((n,m)=>n+Number(m.qty||0),0))}
function statusFor(p){const s=productStock(p.id);return s<=0?{label:'Sin existencias',class:'out'}:s<=Number(p.minimum)?{label:'Bajo mínimo',class:'low'}:{label:'Disponible',class:'ok'}}
function sortMovements(moves){return [...moves].sort((a,b)=>b.date.localeCompare(a.date)||Number(b.created||0)-Number(a.created||0)||String(b.id).localeCompare(String(a.id)))}
function monthMoves(){return state.movements.filter(m=>m.date.startsWith($('report-month').value||monthNow()))}
function getTotal(ms,type){return ms.filter(m=>m.type===type).reduce((v,m)=>v+Number(m.qty)*Number(m.unitCost),0)}
function movementAmount(m){return moneyNum(Math.abs(m.qty)*m.unitCost)}
function skuSort(products){return [...products].sort((a,b)=>a.name.localeCompare(b.name,'es'))}
function formatDate(date){const [y,m,d]=date.split('-');return `${d}/${m}/${y}`}
function emptyLine(msg){return `<div class="empty-inline">${esc(msg)}</div>`}

function switchView(view){if(!['resumen','productos','movimientos','reportes'].includes(view))return;
 document.querySelectorAll('.view').forEach(e=>e.classList.toggle('active',e.id===`view-${view}`));
 document.querySelectorAll('.nav-item').forEach(e=>e.classList.toggle('active',e.dataset.view===view));
 const names={resumen:['Resumen de inventario','Existencias, alertas y movimientos de insumos.'],productos:['Catálogo de insumos','Productos, mínimos, costos y ubicaciones.'],movimientos:['Bitácora de movimientos','Registro de entradas, consumos, ajustes y mermas.'],reportes:['Reportes de inventario','Análisis mensual y protección de tus registros.']};
 $('page-title').textContent=names[view][0];$('page-subtitle').textContent=names[view][1];
 render();window.scrollTo?.({top:0,behavior:'instant'});
}
function render(){renderSummary();renderProducts();renderMovementTable();renderReports()}
function renderSummary(){
 const products=state.products, low=skuSort(products.filter(p=>productStock(p.id)<=Number(p.minimum)));
 $('metric-products').textContent=number(products.length);
 $('metric-value').textContent=cash(products.reduce((sum,p)=>sum+productStock(p.id)*p.cost,0));
 $('metric-alerts').textContent=number(low.length);
 $('metric-waste').textContent=cash(getTotal(state.movements.filter(m=>m.date.startsWith(monthNow())),'merma')*-1);
 $('low-stock-list').innerHTML=low.length?low.slice(0,7).map(p=>{let s=productStock(p.id);return `<div class="low-item"><div><strong>${esc(p.name)}</strong><small>${esc(p.location||'Sin ubicación')} · mínimo ${number(p.minimum)} ${esc(p.unit)}</small></div><div class="right"><b class="danger-text">${number(s)} ${esc(p.unit)}</b><small>${s<=0?'Agotado':'Reponer'}</small></div></div>`}).join(''):emptyLine('Sin alertas de existencias. Agrega insumos para comenzar.');
 const recent=sortMovements(state.movements).slice(0,6);
 $('recent-list').innerHTML=recent.length?recent.map(m=>{const p=productById(m.productId);return `<div class="recent-item"><div><strong>${esc(p?.name||'Insumo no disponible')}</strong><small>${formatDate(m.date)} · ${esc(MOVEMENT_LABELS[m.type])}</small></div><div class="right"><b>${m.qty>0?'+':''}${number(m.qty)} ${esc(p?.unit||'')}</b><small>${cash(movementAmount(m))}</small></div></div>`}).join(''):emptyLine('Todavía no hay movimientos.');
}
function renderProducts(){
 const needle=$('product-search').value.trim().toLocaleLowerCase('es'), filter=$('stock-filter').value;
 const filtered=skuSort(state.products).filter(p=>[p.name,p.sku,p.category,p.location].join(' ').toLocaleLowerCase('es').includes(needle)).filter(p=>filter==='all'||(filter==='low'&&productStock(p.id)<=p.minimum)||(filter==='positive'&&productStock(p.id)>0));
 $('products-body').innerHTML=filtered.map(p=>{const s=productStock(p.id),st=statusFor(p);return `<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.sku)}</small></td><td>${esc(p.category)}<small>${esc(p.location||'Sin ubicación')}</small></td><td>${esc(p.unit)}</td><td class="number"><strong>${number(s)}</strong></td><td class="number">${number(p.minimum)}</td><td class="number">${cash(p.cost)}</td><td><span class="pill ${st.class}">${st.label}</span></td><td><button class="table-link edit-product" data-id="${esc(p.id)}">Editar</button></td></tr>`}).join('');
 $('products-empty').hidden=filtered.length>0;
 $('products-empty').textContent=state.products.length?'No hay insumos con ese filtro.':'Aún no tienes insumos. Presiona «Nuevo insumo» para iniciar.';
}
function renderMovementTable(){
 let rows=sortMovements(state.movements).filter(m=>$('movement-filter').value==='all'||m.type===$('movement-filter').value);
 const since=$('movement-since').value;if(since)rows=rows.filter(m=>m.date>=since);
 $('movements-body').innerHTML=rows.map(m=>{const p=productById(m.productId);return `<tr><td>${formatDate(m.date)}</td><td><strong>${esc(p?.name||'Producto inexistente')}</strong><small>${esc(p?.sku||'')}</small></td><td><span class="pill ${esc(m.type)}">${esc(MOVEMENT_LABELS[m.type])}</span></td><td class="number">${m.qty>0?'+':''}${number(m.qty)} ${esc(p?.unit||'')}</td><td class="number">${cash(movementAmount(m))}</td><td>${esc(m.person||'—')}<small>${esc(m.reason||m.notes||'Sin observaciones')}</small></td></tr>`}).join('');
 $('movements-empty').hidden=rows.length>0;
 $('movements-empty').textContent='No hay movimientos que coincidan con los filtros.';
}
function renderReports(){
 const ms=monthMoves();$('report-in').textContent=cash(getTotal(ms,'entrada'));
 $('report-out').textContent=cash(-getTotal(ms,'salida'));
 $('report-waste').textContent=cash(-getTotal(ms,'merma'));
 $('report-adjust').textContent=cash(getTotal(ms,'ajuste'));
 const grouped={};ms.filter(m=>m.type==='merma').forEach(m=>{grouped[m.productId]=(grouped[m.productId]||0)+movementAmount(m)});
 const top=Object.entries(grouped).map(([id,value])=>({name:productById(id)?.name||id,value})).sort((a,b)=>b.value-a.value).slice(0,7);
 const max=top[0]?.value||1;
 $('waste-bars').innerHTML=top.length?top.map(r=>`<div><div class="bar-info"><span>${esc(r.name)}</span><strong>${cash(r.value)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${(r.value/max*100).toFixed(2)}%"></div></div></div>`).join(''):emptyLine('No hay mermas registradas en el mes seleccionado.');
}

function openProduct(id=null){editingId=id;const form=$('product-form');form.reset();
 if(id){const p=productById(id);if(!p)return;
 $('product-dialog-title').textContent='Editar insumo';$('p-sku').value=p.sku;$('p-name').value=p.name;$('p-category').value=p.category;$('p-unit').value=p.unit;$('p-location').value=p.location;$('p-min').value=p.minimum;$('p-cost').value=p.cost;
 $('initial-wrap').hidden=true;$('p-unit').disabled=state.movements.some(m=>m.productId===id);
 $('product-form-note').textContent='El saldo se modifica con entradas, salidas o ajustes físicos. No se permite cambiar la unidad de un insumo con movimientos.';
 }else{$('product-dialog-title').textContent='Nuevo insumo';$('initial-wrap').hidden=false;$('p-unit').disabled=false;$('product-form-note').textContent='Usa siempre la misma unidad por insumo. La existencia inicial se incorporará a la bitácora.';}
 $('product-dialog').showModal();$('p-sku').focus();
}
function parseNonnegative(value,name){const n=Number(value);if(value===''||!Number.isFinite(n)||n<0)throw Error(`${name}: introduce un número válido mayor o igual a cero.`);return n}
function submitProduct(event){event.preventDefault();try{
 const sku=$('p-sku').value.trim().toUpperCase(),name=$('p-name').value.trim(),category=$('p-category').value,unit=$('p-unit').value,location=$('p-location').value.trim();
 const minimum=roundQty(parseNonnegative($('p-min').value,'Existencia mínima')),cost=moneyNum(parseNonnegative($('p-cost').value,'Costo unitario'));
 if(!sku||!name)throw Error('Es obligatorio indicar la clave y el nombre del insumo.');
 if(state.products.some(p=>p.sku.toUpperCase()===sku&&p.id!==editingId))throw Error('Ya existe un insumo con esa clave (SKU).');
 if(editingId){const p=productById(editingId);if(!p)throw Error('El insumo no existe.');Object.assign(p,{sku,name,category,unit:p.unit,location,minimum,cost});}
 else{const initial=roundQty(parseNonnegative($('p-initial').value,'Existencia inicial'));const id=generateId();state.products.push({id,sku,name,category,unit,location,minimum,cost});if(initial>0)state.movements.push({id:generateId(),productId:id,type:'inicial',date:today(),qty:initial,unitCost:cost,person:'Alta inicial',reason:'Existencia inicial',notes:'',created:Date.now()});}
 if(!save())return;
 $('product-dialog').close();toast(editingId?'Insumo actualizado.':'Insumo agregado al catálogo.');render();
 }catch(err){toast(err.message,true)}}
function fillMovementProducts(){const selected=$('m-product').value;$('m-product').innerHTML='<option value="">Selecciona un insumo</option>'+skuSort(state.products).map(p=>`<option value="${esc(p.id)}">${esc(p.sku)} · ${esc(p.name)}</option>`).join('');if(state.products.some(p=>p.id===selected))$('m-product').value=selected;}
function openMovement(id=null){if(!state.products.length){toast('Primero registra al menos un insumo.',true);switchView('productos');openProduct();return}
 $('movement-form').reset();$('m-date').value=today();$('m-type').value='entrada';fillMovementProducts();if(id)$('m-product').value=id;updateMovementHint();$('movement-dialog').showModal();}
function updateMovementHint(){const p=productById($('m-product').value),type=$('m-type').value;
 $('m-quantity-title').textContent=type==='ajuste'?'Existencia contada físicamente *':'Cantidad *';$('m-quantity').min=type==='ajuste'?'0':'0.001';
 $('m-quantity').placeholder=type==='ajuste'?'Existencia total encontrada':'Cantidad a registrar';
 $('movement-current').textContent=p?`Existencia actual: ${number(productStock(p.id))} ${p.unit} · Costo de referencia: ${cash(p.cost)} / ${p.unit}`:'Selecciona un insumo para consultar su existencia.';
}
function submitMovement(event){event.preventDefault();try{
 const p=productById($('m-product').value),type=$('m-type').value,date=$('m-date').value,person=$('m-person').value.trim(),reason=$('m-reason').value.trim(),notes=$('m-notes').value.trim();
 if(!p)throw Error('Selecciona un insumo.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T00:00:00`)))throw Error('Indica una fecha válida.');
 if(!person)throw Error('Indica quién registra el movimiento.');
 if((type==='merma'||type==='ajuste')&&!reason)throw Error('Indica el motivo de la merma o del ajuste.');
 const amount=roundQty(parseNonnegative($('m-quantity').value,'Cantidad'));
 if(type!=='ajuste'&&amount<=0)throw Error('La cantidad debe ser mayor a cero.');
 const stock=productStock(p.id),qty=type==='ajuste'?roundQty(amount-stock):(type==='entrada'?amount:-amount);
 if(type==='ajuste'&&qty===0)throw Error('El conteo físico coincide con el sistema. No hay diferencia que ajustar.');
 if(stock+qty < -0.000001)throw Error(`Existencias insuficientes: actualmente hay ${number(stock)} ${p.unit}.`);
 state.movements.push({id:generateId(),productId:p.id,type,date,qty,unitCost:p.cost,person,reason,notes,created:Date.now()});
 if(!save())return;
 $('movement-dialog').close();toast(type==='ajuste'?`Ajuste guardado: ${qty>0?'+':''}${number(qty)} ${p.unit}`:'Movimiento registrado correctamente.');render();
 }catch(err){toast(err.message,true)}}

function csvString(rows){return '\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n')+'\r\n'}
function download(filename,content,type='text/csv;charset=utf-8'){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function exportStock(){const rows=[['SKU','Insumo','Categoría','Unidad','Ubicación','Existencia actual','Mínimo','Costo unitario MXN','Valor estimado MXN','Estado']];skuSort(state.products).forEach(p=>{const s=productStock(p.id);rows.push([p.sku,p.name,p.category,p.unit,p.location,s,p.minimum,p.cost,moneyNum(s*p.cost),statusFor(p).label])});download(`didans-existencias-${today()}.csv`,csvString(rows));toast('CSV de existencias descargado.')}
function exportMovements(){const rows=[['Fecha','SKU','Insumo','Unidad','Tipo','Cantidad firmada','Costo unitario registrado MXN','Valor absoluto movimiento MXN','Responsable','Motivo','Notas']];sortMovements(state.movements).filter(m=>($('movement-filter').value==='all'||$('movement-filter').value===m.type)&&(!$('movement-since').value||m.date>=$('movement-since').value)).forEach(m=>{const p=productById(m.productId);rows.push([m.date,p?.sku,p?.name,p?.unit,MOVEMENT_LABELS[m.type],m.qty,m.unitCost,movementAmount(m),m.person,m.reason,m.notes])});download(`didans-movimientos-${today()}.csv`,csvString(rows));toast('Bitácora exportada a CSV.')}
function exportReport(){const ms=monthMoves(),group={};ms.forEach(m=>{const p=productById(m.productId);if(!p)return;const r=group[p.id]||(group[p.id]={sku:p.sku,name:p.name,unit:p.unit,entradas:0,salidas:0,mermas:0,ajustes:0,costoSalidas:0,costoMermas:0});if(m.type==='entrada')r.entradas+=m.qty;if(m.type==='salida'){r.salidas-=m.qty;r.costoSalidas-=m.qty*m.unitCost}if(m.type==='merma'){r.mermas-=m.qty;r.costoMermas-=m.qty*m.unitCost}if(m.type==='ajuste')r.ajustes+=m.qty});
 const rows=[['SKU','Insumo','Unidad','Entrada cantidad','Salida cantidad','Merma cantidad','Ajustes netos cantidad','Costo consumo MXN','Costo merma MXN']];Object.values(group).sort((a,b)=>a.name.localeCompare(b.name,'es')).forEach(r=>rows.push([r.sku,r.name,r.unit,roundQty(r.entradas),roundQty(r.salidas),roundQty(r.mermas),roundQty(r.ajustes),moneyNum(r.costoSalidas),moneyNum(r.costoMermas)]));download(`didans-reporte-${$('report-month').value}.csv`,csvString(rows));toast('Reporte mensual exportado.')}
function backup(){download(`didans-respaldo-${today()}.json`,JSON.stringify({format:'didans-inventario-v1',createdAt:new Date().toISOString(),products:state.products,movements:state.movements},null,2),'application/json;charset=utf-8');toast('Respaldo descargado. Consérvalo en un lugar seguro.')}
function isValidBackup(d){if(d?.format!=='didans-inventario-v1'||!Array.isArray(d.products)||!Array.isArray(d.movements))return false;
 if(d.products.length>5000||d.movements.length>100000)return false;
 const ids=new Set(),skus=new Set();for(const p of d.products){if(typeof p.id!=='string'||ids.has(p.id)||typeof p.sku!=='string'||!p.sku||skus.has(p.sku.toUpperCase())||typeof p.name!=='string'||!p.name||typeof p.unit!=='string'||!['kg','L','pza','caja','paquete'].includes(p.unit)||typeof p.category!=='string'||typeof p.location!=='string'||!Number.isFinite(p.minimum)||p.minimum<0||!Number.isFinite(p.cost)||p.cost<0)return false;ids.add(p.id);skus.add(p.sku.toUpperCase())}
 const movementIds=new Set();const totals={};for(const m of d.movements){if(typeof m.id!=='string'||movementIds.has(m.id)||!ids.has(m.productId)||!Object.hasOwn(MOVEMENT_LABELS,m.type)||typeof m.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||!Number.isFinite(m.qty)||!Number.isFinite(m.unitCost)||m.unitCost<0||!Number.isFinite(m.created)||typeof m.person!=='string'||typeof m.reason!=='string'||typeof m.notes!=='string')return false;movementIds.add(m.id);totals[m.productId]=(totals[m.productId]||0)+m.qty}return Object.values(totals).every(n=>n>=-0.000001)}
async function selectBackup(file){restoreCandidate=null;$('restore-button').disabled=true;$('restore-name').textContent=file?.name||'Ningún archivo seleccionado';if(!file)return;
 try{if(file.size>8*1024*1024)throw Error('El respaldo es demasiado grande (máximo 8 MB).');const parsed=JSON.parse(await file.text());if(!isValidBackup(parsed))throw Error('Este archivo no es un respaldo válido de este sistema.');restoreCandidate=parsed;$('restore-button').disabled=false;toast(`Respaldo reconocido: ${parsed.products.length} insumos y ${parsed.movements.length} movimientos.`)}catch(e){toast(e.message,true);$('restore-name').textContent='Archivo rechazado';}}
function restore(){if(!restoreCandidate)return;if(!confirm(`Se REEMPLAZARÁN los ${state.products.length} insumos y ${state.movements.length} movimientos actuales. ¿Confirmas la restauración?`))return;const old=state;state={products:restoreCandidate.products,movements:restoreCandidate.movements};if(!save()){state=old;return}restoreCandidate=null;$('restore-file').value='';$('restore-name').textContent='Ningún archivo seleccionado';$('restore-button').disabled=true;render();toast('Respaldo restaurado correctamente.');}

document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.go)));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
$('quick-movement').addEventListener('click',()=>openMovement());$('new-movement').addEventListener('click',()=>openMovement());$('new-product').addEventListener('click',()=>openProduct());
$('product-form').addEventListener('submit',submitProduct);$('movement-form').addEventListener('submit',submitMovement);
$('m-type').addEventListener('change',updateMovementHint);$('m-product').addEventListener('change',updateMovementHint);
$('product-search').addEventListener('input',renderProducts);$('stock-filter').addEventListener('change',renderProducts);
$('movement-filter').addEventListener('change',renderMovementTable);$('movement-since').addEventListener('change',renderMovementTable);
$('report-month').addEventListener('change',renderReports);
$('products-body').addEventListener('click',e=>{const b=e.target.closest('.edit-product');if(b)openProduct(b.dataset.id)});
$('export-stock').addEventListener('click',exportStock);$('export-movements').addEventListener('click',exportMovements);$('export-report').addEventListener('click',exportReport);
$('backup-button').addEventListener('click',backup);$('quick-backup').addEventListener('click',backup);
$('restore-file').addEventListener('change',e=>selectBackup(e.target.files?.[0]));$('restore-button').addEventListener('click',restore);
$('today-label').textContent=new Intl.DateTimeFormat('es-MX',{weekday:'short',year:'numeric',month:'short',day:'numeric'}).format(new Date());
$('report-month').value=monthNow();render();
