// Procurement pages — Dashboard, Items list, Item detail, PAR Advisor, Orders.
const { useState, useMemo, useEffect } = React;

// ─── Helpers ───
const fmt$ = (n) => n == null ? '—' : `$${Number(n).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`;
const fmtN = (n) => n == null ? '—' : Number(n).toLocaleString();

// ─── xlsx helpers (import + export) ───
const ITEM_IMPORT_HEADERS = ['Item Name','SKU','Subcategory','Case Size','Lead Time','Unit Cost','Venue','PAR','Monthly Demand','On Hand','Trigger Months'];
const DEPLETION_IMPORT_HEADERS = ['Item','Venue','Observed Monthly Demand'];

function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try { resolve(XLSX.read(new Uint8Array(e.target.result), { type: 'array' })); }
      catch (err) { reject(err); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// Item import: rows under headers Item|SKU|Subcategory|Case|LT|UnitCost|Venue|PAR|Monthly|OnHand|Trigger
async function parseItemsFromFile(file) {
  const wb = await readWorkbook(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const itemMap = {};
  rows.forEach((row, i) => {
    if (i === 0) return;
    const name = String(row[0] || '').trim();
    if (!name) return;
    if (!itemMap[name]) {
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36) + '-' + i;
      itemMap[name] = {
        id, name,
        sku: String(row[1] || ''),
        category: 'OS&E',
        subcategory: String(row[2] || 'Bar Tools'),
        caseSize: parseInt(row[3]) || 12,
        leadTime: parseInt(row[4]) || 21,
        unitCost: row[5] != null && row[5] !== '' ? parseFloat(row[5]) : null,
        shippingCost: null,
        shippingType: 'flat',
        supplier: '',
        supplierContact: '',
        venues: [],
        warehouse: { reviewPeriod: 7, maxSimultaneousVenues: 2, currentOnHand: 0, currentOnPO: 0, overrideS: null, overrideBigS: null },
      };
    }
    const venueName = String(row[6] || '').trim();
    if (venueName) {
      itemMap[name].venues.push({
        name: venueName,
        par: parseInt(row[7]) || 0,
        monthlyDemand: parseFloat(row[8]) || 0,
        currentOnHand: parseInt(row[9]) || 0,
        reorderTriggerMonths: parseFloat(row[10]) || 2.5,
      });
    }
  });
  return Object.values(itemMap);
}

// Depletion import: Item | Venue | Observed Monthly Demand
async function parseDepletionFromFile(file) {
  const wb = await readWorkbook(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const out = [];
  rows.forEach((row, i) => {
    if (i === 0) return;
    const itemName = String(row[0] || '').trim();
    const venueName = String(row[1] || '').trim();
    const observed = parseFloat(row[2]) || 0;
    if (itemName && venueName) out.push({ itemName, venueName, observed });
  });
  return out;
}

function buildItemsSummarySheet(reports) {
  const data = [['Item','SKU','Category','Case','Lead Time','Supplier','Venues','Monthly','Daily','s','S','Reorder','Venue Need','Warehouse Need','Total Order','Est. Cost','Status']];
  reports.forEach(r => {
    const venuesNeeding = r.venues.filter(v => v.needNow > 0).length;
    const whBelow = r.warehouse.currentOnHand <= r.warehouse.sReorderPoint;
    let status = 'In Position';
    if (r.firstOrder.totalUnits > 0) status = whBelow && venuesNeeding > 0 ? 'Reorder Now' : whBelow ? 'Warehouse Low' : venuesNeeding > 0 ? `${venuesNeeding} Venue Top-Up` : 'Monitor';
    data.push([
      r.item.name, r.item.sku, `${r.item.category} / ${r.item.subcategory}`, r.item.caseSize, r.item.leadTime + 'd',
      r.item.supplier, r.venues.length,
      r.warehouse.combinedMonthlyDemand, r.warehouse.combinedDailyDemand,
      r.warehouse.sReorderPoint, r.warehouse.bigS, r.warehouse.reorderQty,
      r.firstOrder.venueUnits, r.firstOrder.warehouseUnits, r.firstOrder.totalUnits,
      r.firstOrder.totalCost ?? '', status,
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:24},{wch:14},{wch:24},{wch:6},{wch:10},{wch:24},{wch:7},{wch:9},{wch:8},{wch:6},{wch:6},{wch:9},{wch:11},{wch:14},{wch:12},{wch:11},{wch:18}];
  return ws;
}

function buildVenueDetailSheet(reports) {
  const data = [['Item','Destination','PAR / S','Monthly','On Hand','Min (r)','Max (S)','Need Now','Cases']];
  reports.forEach(r => {
    r.venues.forEach(v => data.push([r.item.name, v.name, v.par, v.monthlyDemand, v.currentOnHand, v.minR, v.maxS, v.needNowCases, v.needNowPacks]));
    data.push([r.item.name, 'Warehouse', r.warehouse.bigS, r.warehouse.combinedMonthlyDemand, r.warehouse.currentOnHand, '—', '—', r.warehouse.warehouseNeedCases, Math.floor(r.warehouse.warehouseNeedCases / r.item.caseSize)]);
    data.push([r.item.name, 'TOTAL ORDER', '', '', '', '', '', r.firstOrder.totalUnits, r.firstOrder.totalCases]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:24},{wch:18},{wch:8},{wch:9},{wch:9},{wch:9},{wch:9},{wch:10},{wch:8}];
  return ws;
}

function buildSuggestedPOsSheet(reports) {
  const data = [['Supplier','Item','SKU','Destination','Units','Cases','Est. Cost','Lead Time']];
  reports.forEach(r => {
    r.venues.forEach(v => {
      if (v.needNowCases > 0) {
        data.push([r.item.supplier, r.item.name, r.item.sku, v.name, v.needNowCases, v.needNowPacks, r.item.unitCost ? +(v.needNowCases * r.item.unitCost).toFixed(2) : '', r.item.leadTime + 'd']);
      }
    });
    if (r.warehouse.warehouseNeedCases > 0) {
      data.push([r.item.supplier, r.item.name, r.item.sku, 'Warehouse', r.warehouse.warehouseNeedCases, Math.floor(r.warehouse.warehouseNeedCases / r.item.caseSize), r.item.unitCost ? +(r.warehouse.warehouseNeedCases * r.item.unitCost).toFixed(2) : '', r.item.leadTime + 'd']);
    }
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:26},{wch:24},{wch:14},{wch:18},{wch:8},{wch:7},{wch:10},{wch:10}];
  return ws;
}

function exportAllXlsx(reports) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildItemsSummarySheet(reports), 'Summary');
  XLSX.utils.book_append_sheet(wb, buildVenueDetailSheet(reports), 'Destinations');
  XLSX.utils.book_append_sheet(wb, buildSuggestedPOsSheet(reports), 'Suggested POs');
  XLSX.writeFile(wb, 'Procurement_All_Items.xlsx');
}

function exportItemDetailXlsx(item, report) {
  const wb = XLSX.utils.book_new();
  const spec = [
    ['Item', item.name], ['SKU', item.sku],
    ['Category', `${item.category} / ${item.subcategory}`],
    ['Case Size', item.caseSize], ['Lead Time', item.leadTime + 'd'],
    ['Unit Cost', item.unitCost ?? ''], ['Shipping Cost', item.shippingCost ?? ''],
    ['Shipping Type', item.shippingType],
    ['Supplier', item.supplier], ['Supplier Contact', item.supplierContact], [],
    ['WAREHOUSE'],
    ['s (Reorder Point)', report.warehouse.sReorderPoint],
    ['S (Order-Up-To)', report.warehouse.bigS],
    ['Reorder Qty', report.warehouse.reorderQty],
    ['Safety Stock', report.warehouse.safetyStock],
    ['Combined Monthly', report.warehouse.combinedMonthlyDemand],
    ['Daily', report.warehouse.combinedDailyDemand],
    ['Velocity', report.warehouse.velocity],
    ['On Hand', report.warehouse.currentOnHand],
    ['On PO', report.warehouse.currentOnPO],
    ['Override Active', report.warehouse.overridden ? 'YES' : 'NO'],
    ['Formula s', report.warehouse.formulaS],
    ['Formula S', report.warehouse.formulaBigS],
    [], ['FIRST ORDER'],
    ['Venue Need', report.firstOrder.venueUnits],
    ['Warehouse Need', report.firstOrder.warehouseUnits],
    ['Total Order', report.firstOrder.totalUnits],
    ['Total Cases', report.firstOrder.totalCases],
    ['Est. Cost', report.firstOrder.totalCost ?? ''],
  ];
  const wsSpec = XLSX.utils.aoa_to_sheet(spec);
  wsSpec['!cols'] = [{wch:22},{wch:30}];
  XLSX.utils.book_append_sheet(wb, wsSpec, 'Specs');

  const v = [['Venue','PAR','Monthly','Daily','Velocity','On Hand','Min (r)','Max (S)','Top-Up','Cases']];
  report.venues.forEach(x => v.push([x.name, x.par, x.monthlyDemand, x.dailyDemand, x.velocity, x.currentOnHand, x.minR, x.maxS, x.needNowCases, x.needNowPacks]));
  v.push(['Warehouse', report.warehouse.bigS, report.warehouse.combinedMonthlyDemand, report.warehouse.combinedDailyDemand, report.warehouse.velocity, report.warehouse.currentOnHand, '—', '—', report.warehouse.warehouseNeedCases, Math.floor(report.warehouse.warehouseNeedCases / item.caseSize)]);
  v.push(['TOTAL ORDER','','','','','','','', report.firstOrder.totalUnits, report.firstOrder.totalCases]);
  const wsV = XLSX.utils.aoa_to_sheet(v);
  wsV['!cols'] = [{wch:18},{wch:6},{wch:9},{wch:8},{wch:9},{wch:9},{wch:7},{wch:7},{wch:9},{wch:7}];
  XLSX.utils.book_append_sheet(wb, wsV, 'Venues');

  const st = [['Day','Event','Stock','Stockout?']];
  report.stress.forEach(e => st.push([e.day, e.event, e.stock, e.stockout ? 'YES' : '']));
  const wsSt = XLSX.utils.aoa_to_sheet(st);
  wsSt['!cols'] = [{wch:6},{wch:50},{wch:8},{wch:10}];
  XLSX.utils.book_append_sheet(wb, wsSt, 'Stress Test');

  if (report.tco) {
    const tco = [['Cases','Units','Product Cost','Shipping','Total','$/Unit']];
    report.tco.forEach(t => tco.push([t.cases, t.units, t.productCost, t.shipping, t.total, t.tcoPerUnit]));
    const wsT = XLSX.utils.aoa_to_sheet(tco);
    wsT['!cols'] = [{wch:7},{wch:8},{wch:13},{wch:10},{wch:10},{wch:9}];
    XLSX.utils.book_append_sheet(wb, wsT, 'TCO');
  }

  XLSX.writeFile(wb, `${(item.name || 'item').replace(/[^A-Za-z0-9]+/g, '_')}.xlsx`);
}

function exportSuggestedPOsXlsx(reports) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSuggestedPOsSheet(reports), 'Suggested POs');
  XLSX.utils.book_append_sheet(wb, buildVenueDetailSheet(reports), 'Detail');
  XLSX.writeFile(wb, 'Suggested_POs.xlsx');
}

function downloadImportTemplate() {
  const wb = XLSX.utils.book_new();
  const sample = [ITEM_IMPORT_HEADERS,
    ['Serving Tong Medium','GRM 880071','Bar Tools',12,21,8.40,'Delilah LA',30,9,6,2.5],
    ['Serving Tong Medium','GRM 880071','Bar Tools',12,21,8.40,'Delilah MIA',50,9,18,2.5],
    ['Coupe Glass','COUPE-LR-21','Glassware - Delicate',24,21,4.48,'Delilah LA',120,20,15,2.5],
  ];
  const ws = XLSX.utils.aoa_to_sheet(sample);
  ws['!cols'] = ITEM_IMPORT_HEADERS.map(() => ({wch:18}));
  XLSX.utils.book_append_sheet(wb, ws, 'Items');
  const dws = XLSX.utils.aoa_to_sheet([DEPLETION_IMPORT_HEADERS, ['Serving Tong Medium','Delilah LA',12], ['Coupe Glass','Delilah LA',24]]);
  dws['!cols'] = DEPLETION_IMPORT_HEADERS.map(() => ({wch:22}));
  XLSX.utils.book_append_sheet(wb, dws, 'Depletion');
  XLSX.writeFile(wb, 'Procurement_Import_Template.xlsx');
}

function statusForItem(report) {
  // determine an item-level status pill
  const venuesNeedingNow = report.venues.filter(v => v.needNow > 0).length;
  const whBelow = report.warehouse.currentOnHand <= report.warehouse.sReorderPoint;
  const totalNeed = report.firstOrder.totalUnits;
  if (totalNeed === 0) return { tone: 'ok', label: 'In Position' };
  if (whBelow && venuesNeedingNow > 0) return { tone: 'bad', label: 'Reorder Now' };
  if (whBelow) return { tone: 'warn', label: 'Warehouse Low' };
  if (venuesNeedingNow > 0) return { tone: 'warn', label: `${venuesNeedingNow} Venue Top-Up` };
  return { tone: 'info', label: 'Monitor' };
}

// ─── Dashboard ───
function DashboardPage({ items, reports, gotoItem, gotoTab }) {
  const totalVenues = new Set(items.flatMap(i => i.venues.map(v => v.name))).size;
  const totalItems = items.length;
  const openValue = reports.reduce((a, r) => a + (r.firstOrder.totalCost || 0), 0);
  const itemsAtRisk = reports.filter(r => statusForItem(r).tone === 'bad').length;
  const itemsToWatch = reports.filter(r => statusForItem(r).tone === 'warn').length;

  // compute aggregate POs to be issued
  const pos = reports.flatMap(r => {
    const out = [];
    r.venues.forEach(v => {
      if (v.needNowCases > 0) out.push({ item: r.item.name, dest: v.name, units: v.needNowCases, kind: 'venue' });
    });
    if (r.warehouse.warehouseNeedCases > 0) out.push({ item: r.item.name, dest: 'Warehouse', units: r.warehouse.warehouseNeedCases, kind: 'wh' });
    return out;
  });

  return (
    <div className="stack" style={{gap:24}}>
      {/* KPI strip */}
      <div className="kpi-row">
        <Kpi deep label="Items Tracked" value={totalItems} sub={`Across ${totalVenues} venues`}/>
        <Kpi label="Reorder Now" value={itemsAtRisk} sub={itemsAtRisk === 0 ? 'All items in position' : 'Items below reorder point'}/>
        <Kpi label="Watch List" value={itemsToWatch} sub="Need attention this week"/>
        <Kpi label="Open Order Value" value={fmt$(openValue)} sub="Recommended POs, all items"/>
      </div>

      <div className="detail-grid">
        <Card title="Items by Status" right={<Btn variant="ghost" size="sm" onClick={()=>gotoTab('items')}>View All</Btn>}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Item</th>
                <th>Subcategory</th>
                <th className="right">Monthly Demand</th>
                <th className="right">On Hand (WH)</th>
                <th className="right">Suggested Order</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r, i) => {
                const s = statusForItem(r);
                return (
                  <tr key={r.item.id} onClick={()=>gotoItem(r.item.id)}>
                    <td>
                      <div className="name">{r.item.name}</div>
                      <div className="sku">{r.item.sku}</div>
                    </td>
                    <td className="muted">{r.item.subcategory}</td>
                    <td className="right"><span className="num">{r.warehouse.combinedMonthlyDemand}</span> <span className="muted">/mo</span></td>
                    <td className="right"><span className="num">{r.warehouse.currentOnHand}</span></td>
                    <td className="right">
                      {r.firstOrder.totalUnits > 0
                        ? <span className="num">{r.firstOrder.totalUnits} <span className="muted">({r.firstOrder.totalCases} cases)</span></span>
                        : <span className="muted">—</span>}
                    </td>
                    <td><Pill tone={s.tone}>{s.label}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <div className="stack" style={{gap:14}}>
          <Card title="Recommended POs" compact>
            {pos.length === 0 ? <div className="muted" style={{padding:'8px 0'}}>No orders needed today.</div> :
              <div className="stack-sm">
                {pos.slice(0, 6).map((p, i) => (
                  <div key={i} className="row between" style={{padding:'8px 0', borderBottom:'1px solid var(--woody-line-warm)'}}>
                    <div>
                      <div style={{font:'500 13px/18px var(--font-sans)'}}>{p.item}</div>
                      <div style={{font:'400 11px/14px var(--font-sans)', color:'var(--woody-ink-4)'}}>→ {p.dest}</div>
                    </div>
                    <div className="num" style={{font:'600 14px/18px var(--font-numeric)'}}>{p.units} <span style={{color:'var(--woody-ink-4)', fontWeight:400, fontSize:11}}>units</span></div>
                  </div>
                ))}
              </div>
            }
            <div style={{paddingTop:12}}>
              <Btn size="sm" variant="ghost" onClick={()=>gotoTab('orders')}>Go to Purchase Orders →</Btn>
            </div>
          </Card>

          <Card title="System Health" compact>
            <div className="stack-sm">
              <div className="row between"><span className="muted" style={{fontSize:13}}>Avg Lead Time</span><b className="num">{Math.round(items.reduce((a,i)=>a+i.leadTime,0)/items.length)} days</b></div>
              <div className="row between"><span className="muted" style={{fontSize:13}}>Active Suppliers</span><b className="num">{new Set(items.map(i=>i.supplier)).size}</b></div>
              <div className="row between"><span className="muted" style={{fontSize:13}}>Service Level Target</span><b className="num">95%</b></div>
              <div className="row between"><span className="muted" style={{fontSize:13}}>Review Cycle</span><b className="num">Weekly</b></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Items List ───
function ItemsPage({ items, reports, gotoItem, openNew, onImport, onToast }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all'); // all, reorder, watch, ok
  const fileRef = React.useRef(null);
  const filtered = reports.filter(r => {
    const s = statusForItem(r);
    if (filter === 'reorder' && s.tone !== 'bad') return false;
    if (filter === 'watch' && s.tone !== 'warn') return false;
    if (filter === 'ok' && s.tone !== 'ok') return false;
    if (q && !(r.item.name + ' ' + r.item.sku + ' ' + r.item.supplier).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = await parseItemsFromFile(file);
      if (imported.length === 0) {
        onToast?.('No items found in file');
        return;
      }
      onImport?.(imported);
      onToast?.(`Imported ${imported.length} item${imported.length === 1 ? '' : 's'}`);
    } catch (err) {
      console.error(err);
      onToast?.(`Import failed: ${err.message}`);
    }
  };

  return (
    <div className="stack" style={{gap:18}}>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={handleImport}/>
      <div className="filter-bar">
        <Input leading="search" placeholder="Search items, SKU, supplier" value={q} onChange={(e)=>setQ(e.target.value)}/>
        <span className={`chip ${filter==='all'?'on':''}`} onClick={()=>setFilter('all')}>All <span className="num" style={{opacity:.6, marginLeft:4}}>{reports.length}</span></span>
        <span className={`chip ${filter==='reorder'?'on':''}`} onClick={()=>setFilter('reorder')}>Reorder Now <span className="num" style={{opacity:.6, marginLeft:4}}>{reports.filter(r=>statusForItem(r).tone==='bad').length}</span></span>
        <span className={`chip ${filter==='watch'?'on':''}`} onClick={()=>setFilter('watch')}>Watch <span className="num" style={{opacity:.6, marginLeft:4}}>{reports.filter(r=>statusForItem(r).tone==='warn').length}</span></span>
        <span className={`chip ${filter==='ok'?'on':''}`} onClick={()=>setFilter('ok')}>In Position <span className="num" style={{opacity:.6, marginLeft:4}}>{reports.filter(r=>statusForItem(r).tone==='ok').length}</span></span>
        <div style={{flex:1}}></div>
        <Btn variant="ghost" size="sm" leading="download" onClick={downloadImportTemplate}>Template</Btn>
        <Btn variant="ghost" size="sm" leading="upload" onClick={()=>fileRef.current?.click()}>Import</Btn>
        <Btn variant="ghost" size="sm" leading="download" onClick={()=>exportAllXlsx(reports)}>Export All</Btn>
        <Btn size="sm" leading="plus-bkg" onClick={openNew}>New Item</Btn>
      </div>

      <Card>
        {filtered.length === 0
          ? <div className="empty"><h3>Nothing here</h3><p>No items match your search. Try clearing the filters.</p></div>
          : <table className="tbl">
            <thead>
              <tr>
                <th>Item</th>
                <th>Supplier</th>
                <th>Velocity</th>
                <th className="right">Case</th>
                <th className="right">Monthly</th>
                <th className="right">WH s / S</th>
                <th className="right">On Hand</th>
                <th className="right">To Order</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const s = statusForItem(r);
                return (
                  <tr key={r.item.id} onClick={()=>gotoItem(r.item.id)}>
                    <td><div className="name">{r.item.name}</div><div className="sku">{r.item.sku} · {r.item.subcategory}</div></td>
                    <td className="muted" style={{fontSize:13}}>{r.item.supplier}</td>
                    <td><VelocityTag v={r.warehouse.velocity}/></td>
                    <td className="right num">{r.item.caseSize}</td>
                    <td className="right num">{r.warehouse.combinedMonthlyDemand}</td>
                    <td className="right num">{r.warehouse.sReorderPoint} / {r.warehouse.bigS}</td>
                    <td className="right num">{r.warehouse.currentOnHand}</td>
                    <td className="right">
                      {r.firstOrder.totalUnits > 0
                        ? <span className="num"><b>{r.firstOrder.totalUnits}</b> <span className="muted" style={{fontSize:11}}>({r.firstOrder.totalCases}c)</span></span>
                        : <span className="muted">—</span>}
                    </td>
                    <td><Pill tone={s.tone}>{s.label}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>}
      </Card>
    </div>
  );
}

// ─── Item Detail ───
function ItemDetail({ item, report, onBack, onEdit, onUpdate }) {
  const [tab, setTab] = useState('overview');
  const s = statusForItem(report);

  return (
    <div className="stack" style={{gap:18}}>
      <div className="row" style={{gap:8, marginBottom:-4}}>
        <Btn variant="ghost" size="sm" leading="back" onClick={onBack}>All Items</Btn>
        <span className="muted" style={{fontSize:12, letterSpacing:'0.04em', textTransform:'uppercase'}}>·</span>
        <span className="muted" style={{fontSize:12, letterSpacing:'0.04em', textTransform:'uppercase'}}>{item.category} / {item.subcategory}</span>
      </div>

      <div className="row between" style={{alignItems:'flex-start'}}>
        <div>
          <div className="row" style={{gap:12, marginBottom:6}}>
            <h1 style={{font:'700 28px/34px var(--font-sans)', color:'var(--woody-ink)'}}>{item.name}</h1>
            <Pill tone={s.tone}>{s.label}</Pill>
          </div>
          <div className="row" style={{gap:18, color:'var(--woody-ink-4)', fontSize:13}}>
            <span>SKU <b style={{color:'var(--woody-ink)', fontWeight:500, fontFamily:'var(--font-mono)'}}>{item.sku}</b></span>
            <span>Case <b style={{color:'var(--woody-ink)', fontWeight:500}} className="num">{item.caseSize}</b></span>
            <span>Lead Time <b style={{color:'var(--woody-ink)', fontWeight:500}} className="num">{item.leadTime}d</b></span>
            <span>Supplier <b style={{color:'var(--woody-ink)', fontWeight:500}}>{item.supplier}</b></span>
          </div>
        </div>
        <div className="row" style={{gap:8}}>
          <Btn variant="ghost" size="sm" leading="edit" onClick={onEdit}>Edit</Btn>
          <Btn variant="ghost" size="sm" leading="download" onClick={()=>exportItemDetailXlsx(item, report)}>Export</Btn>
          <Btn size="sm" leading="plus-bkg">Generate POs</Btn>
        </div>
      </div>

      <div className="kpi-row">
        <Kpi deep label="Suggested First Order" value={report.firstOrder.totalUnits} unit="units" sub={`${report.firstOrder.totalCases} cases · ${fmt$(report.firstOrder.totalCost)}`}/>
        <Kpi label="Warehouse s / S" value={`${report.warehouse.sReorderPoint} / ${report.warehouse.bigS}`} sub={report.warehouse.overridden ? `Manual override (formula ${report.warehouse.formulaS}/${report.warehouse.formulaBigS})` : `${report.warehouse.reorderQty} units per reorder`}/>
        <Kpi label="Combined Demand" value={report.warehouse.combinedMonthlyDemand} unit="/mo" sub={`${report.warehouse.combinedDailyDemand} / day · ${report.warehouse.velocity}`}/>
        <Kpi label="Warehouse Stock" value={report.warehouse.currentOnHand} unit="units" sub={report.warehouse.currentOnHand <= report.warehouse.sReorderPoint ? 'Below reorder point' : 'Above reorder point'}/>
      </div>

      <div className="subtabs">
        {['overview','venues','warehouse','stress','tco'].map(t => (
          <div key={t} className={`t ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
            {{overview:'Overview', venues:'Venues', warehouse:'Warehouse', stress:'Stress Test', tco:'TCO Analysis'}[t]}
          </div>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab item={item} report={report}/>}
      {tab === 'venues' && <VenuesTab item={item} report={report} onUpdate={onUpdate}/>}
      {tab === 'warehouse' && <WarehouseTab item={item} report={report} onUpdate={onUpdate}/>}
      {tab === 'stress' && <StressTab item={item} report={report}/>}
      {tab === 'tco' && <TcoTab item={item} report={report}/>}
    </div>
  );
}

function OverviewTab({ item, report }) {
  return (
    <div className="detail-grid">
      <div className="stack">
        <Card title="Recommended Action">
          <div className="stack-sm">
            {report.venues.filter(v => v.needNowCases > 0).map(v => (
              <div key={v.name} className="po-card">
                <div className="po-icon"><img src={ICON('members')} alt=""/></div>
                <div>
                  <div className="po-dest">{v.name}</div>
                  <div className="po-meta">Top up to PAR {v.par} · currently holds {v.currentOnHand}</div>
                </div>
                <div className="po-qty">
                  <div className="big">{v.needNowCases}</div>
                  <div className="small">{v.needNowPacks} cases</div>
                </div>
              </div>
            ))}
            {report.warehouse.warehouseNeedCases > 0 && (
              <div className="po-card">
                <div className="po-icon"><img src={ICON('balance')} alt=""/></div>
                <div>
                  <div className="po-dest">Warehouse</div>
                  <div className="po-meta">Stock to S = {report.warehouse.bigS} · holds {report.warehouse.currentOnHand}</div>
                </div>
                <div className="po-qty">
                  <div className="big">{report.warehouse.warehouseNeedCases}</div>
                  <div className="small">{Math.floor(report.warehouse.warehouseNeedCases/item.caseSize)} cases</div>
                </div>
              </div>
            )}
            {report.firstOrder.totalUnits === 0 && (
              <div className="empty"><h3>No orders needed</h3><p>All venues are at PAR and the warehouse is above its reorder point.</p></div>
            )}
          </div>
        </Card>

        <Card title="Demand by Venue">
          <div className="stack-sm">
            {(() => {
              const max = Math.max(...report.venues.map(v => v.monthlyDemand), 1);
              return report.venues.map(v => (
                <div key={v.name} className="demand-row">
                  <div className="v-name">{v.name}</div>
                  <div className="v-bar-bg"><div className="v-bar" style={{width: `${(v.monthlyDemand/max)*100}%`}}/></div>
                  <div className="v-val">{v.monthlyDemand}/mo</div>
                </div>
              ));
            })()}
          </div>
        </Card>
      </div>

      <div className="stack">
        <Card title="Specifications" compact>
          <dl className="props">
            <dt>SKU</dt><dd style={{fontFamily:'var(--font-mono)', fontSize:13}}>{item.sku}</dd>
            <dt>Category</dt><dd>{item.category} / {item.subcategory}</dd>
            <dt>Case Size</dt><dd className="num">{item.caseSize} units</dd>
            <dt>Unit Cost</dt><dd className="num">{fmt$(item.unitCost)}</dd>
            <dt>Shipping</dt><dd className="num">{fmt$(item.shippingCost)} <span className="muted" style={{fontSize:11}}>({item.shippingType.replace('_',' ')})</span></dd>
            <dt>Lead Time</dt><dd className="num">{item.leadTime} days</dd>
          </dl>
        </Card>
        <Card title="Supplier" compact>
          <dl className="props">
            <dt>Name</dt><dd>{item.supplier}</dd>
            <dt>Contact</dt><dd style={{fontSize:13, color:'var(--woody-ink-3)'}}>{item.supplierContact}</dd>
            <dt>Lead Time</dt><dd className="num">{item.leadTime} days</dd>
            <dt>Service Level</dt><dd className="num">95%</dd>
          </dl>
          <hr className="rule" style={{margin:'14px 0 10px'}}/>
          <Btn variant="ghost" size="sm" leading="mail">Email Supplier</Btn>
        </Card>
      </div>
    </div>
  );
}

function VenuesTab({ item, report, onUpdate }) {
  const updateVenue = (idx, field, value) => {
    const next = { ...item, venues: item.venues.map((v, i) => i === idx ? { ...v, [field]: value } : v) };
    onUpdate(next);
  };
  const addVenue = () => {
    onUpdate({ ...item, venues: [...item.venues, { name: 'New Venue', par: 30, monthlyDemand: 5, currentOnHand: 0, reorderTriggerMonths: 2.5 }] });
  };
  const removeVenue = (idx) => {
    onUpdate({ ...item, venues: item.venues.filter((_, i) => i !== idx) });
  };

  return (
    <Card title="Venues" right={<Btn size="sm" variant="ghost" leading="plus-bkg" onClick={addVenue}>Add Venue</Btn>}>
      <table className="tbl venue-tbl">
        <thead>
          <tr>
            <th>Venue</th>
            <th className="right">PAR</th>
            <th className="right">Monthly Demand</th>
            <th className="right">On Hand</th>
            <th className="right">Trigger (mo)</th>
            <th className="right">Min (r)</th>
            <th className="right">Max (S)</th>
            <th>Velocity</th>
            <th className="right">Top Up</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {report.venues.map((v, i) => (
            <tr key={i}>
              <td><input className="cell text" value={item.venues[i].name} onChange={(e)=>updateVenue(i, 'name', e.target.value)}/></td>
              <td className="right"><input className="cell" type="number" value={item.venues[i].par} onChange={(e)=>updateVenue(i, 'par', +e.target.value || 0)}/></td>
              <td className="right"><input className="cell" type="number" step="0.5" value={item.venues[i].monthlyDemand} onChange={(e)=>updateVenue(i, 'monthlyDemand', +e.target.value || 0)}/></td>
              <td className="right"><input className="cell" type="number" value={item.venues[i].currentOnHand} onChange={(e)=>updateVenue(i, 'currentOnHand', +e.target.value || 0)}/></td>
              <td className="right"><input className="cell" type="number" step="0.5" value={item.venues[i].reorderTriggerMonths} onChange={(e)=>updateVenue(i, 'reorderTriggerMonths', +e.target.value || 0)}/></td>
              <td className="right num">{v.minR}</td>
              <td className="right num">{v.maxS}</td>
              <td><VelocityTag v={v.velocity}/></td>
              <td className="right">{v.needNowCases > 0 ? <b className="num" style={{color:'var(--woody-error)'}}>{v.needNowCases}</b> : <span className="muted">—</span>}</td>
              <td><img src={ICON('delete')} style={{width:16, height:16, opacity:0.5, cursor:'pointer'}} onClick={()=>removeVenue(i)} alt="remove"/></td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="rule" style={{margin:'14px 0 12px'}}/>
      <div className="row" style={{justifyContent:'flex-end', gap:24, color:'var(--woody-ink-4)', fontSize:13}}>
        <span>Combined demand: <b className="num" style={{color:'var(--woody-ink)'}}>{report.warehouse.combinedMonthlyDemand}/mo</b></span>
        <span>Total venue top-up: <b className="num" style={{color:'var(--woody-ink)'}}>{report.firstOrder.venueUnits} units</b></span>
      </div>
    </Card>
  );
}

function WarehouseTab({ item, report, onUpdate }) {
  const wh = item.warehouse;
  const setWh = (field, value) => onUpdate({ ...item, warehouse: { ...wh, [field]: value }});
  const overridden = wh.overrideS != null || wh.overrideBigS != null;

  return (
    <div className="detail-grid">
      <Card title="Warehouse Configuration">
        <div className="form-grid">
          <NumField label="Max Simultaneous Venues" value={wh.maxSimultaneousVenues} onChange={(v)=>setWh('maxSimultaneousVenues', v)} hint="Realistic max venues ordering at once"/>
          <NumField label="Review Period" value={wh.reviewPeriod} onChange={(v)=>setWh('reviewPeriod', v)} suffix="days"/>
          <NumField label="Current On Hand" value={wh.currentOnHand} onChange={(v)=>setWh('currentOnHand', v)} suffix="units"/>
          <NumField label="Currently On PO" value={wh.currentOnPO} onChange={(v)=>setWh('currentOnPO', v)} suffix="units"/>
        </div>
        <hr className="rule" style={{margin:'18px 0 12px'}}/>
        <div className="row between" style={{marginBottom: 10}}>
          <div>
            <div style={{font:'600 13px/18px var(--font-sans)'}}>Manual Override</div>
            <div className="muted" style={{fontSize:12}}>Pin s and S when the formula doesn't match real-world judgment.</div>
          </div>
          <Switch on={overridden} onChange={(on)=>{
            if (on) setWh('overrideS', report.warehouse.formulaS);
            else { setWh('overrideS', null); setTimeout(()=>setWh('overrideBigS', null), 0); }
          }}/>
        </div>
        {overridden && (
          <div className="form-grid">
            <NumField label="s — Reorder Point" value={wh.overrideS} onChange={(v)=>setWh('overrideS', v)} hint={`Formula: ${report.warehouse.formulaS}`}/>
            <NumField label="S — Order-Up-To" value={wh.overrideBigS} onChange={(v)=>setWh('overrideBigS', v)} hint={`Formula: ${report.warehouse.formulaBigS}`}/>
          </div>
        )}
      </Card>

      <Card title="Computed Levels" compact>
        <dl className="props">
          <dt>Safety Stock</dt><dd className="num">{report.warehouse.safetyStock} units</dd>
          <dt>Reorder Point (s)</dt><dd className="num"><b>{report.warehouse.sReorderPoint}</b> units</dd>
          <dt>Order-Up-To (S)</dt><dd className="num"><b>{report.warehouse.bigS}</b> units</dd>
          <dt>Reorder Qty</dt><dd className="num">{report.warehouse.reorderQty} ({report.warehouse.reorderQtyCases} cases)</dd>
          <dt>Simultaneous Draw</dt><dd className="num">{report.warehouse.simultaneousDraw} units</dd>
          <dt>Velocity</dt><dd><VelocityTag v={report.warehouse.velocity}/></dd>
        </dl>
        {report.warehouse.overridden && (
          <div className="diag-card warn" style={{marginTop:14}}>
            <div className="diag-icon"><img src={ICON('help-filled')} alt=""/></div>
            <div>
              <div className="diag-title">Manual Override Active</div>
              <div className="diag-text">Formula recommended s = {report.warehouse.formulaS}, S = {report.warehouse.formulaBigS}. Stress test runs against the override values.</div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function StressTab({ item, report }) {
  const events = report.stress;
  const peak = Math.max(...events.map(e => e.stock), report.warehouse.bigS);
  return (
    <Card title="Worst-Case Drawdown" right={<span className="muted" style={{fontSize:12}}>Starting from s = {report.warehouse.sReorderPoint} on day 0</span>}>
      <div className="stress">
        {events.map((e, i) => {
          const stock = Math.max(0, e.stock);
          const pct = (stock / peak) * 100;
          let cls = 'ok';
          if (e.stock < 0) cls = 'out';
          else if (e.stock < report.warehouse.safetyStock) cls = 'low';
          return (
            <div key={i} className="stress-row">
              <div className="stress-day">
                <span className="lbl">Day</span>
                {e.day}
              </div>
              <div>
                <div className="stress-event"><b>{e.event}</b></div>
                <div className="stress-bar-wrap" style={{marginTop:6}}>
                  <div className={`stress-bar ${cls}`} style={{width: `${Math.max(2, pct)}%`}}/>
                </div>
              </div>
              <div className="stress-stock">{e.stock} <span className="muted" style={{fontWeight:400, fontSize:11}}>units</span></div>
              <div>{e.stockout && <Pill tone="bad">Stockout</Pill>}{e.kind === 'arrive' && <Pill tone="ok">Delivery</Pill>}{e.kind === 'po' && <Pill tone="info">PO Placed</Pill>}</div>
            </div>
          );
        })}
      </div>
      <hr className="rule" style={{margin:'18px 0 10px'}}/>
      <div className="diag-card info">
        <div className="diag-icon"><img src={ICON('help-outlined')} alt=""/></div>
        <div>
          <div className="diag-title">How to read this</div>
          <div className="diag-text">Simulates the warehouse hitting reorder point on day 0, with up to <b>{report.warehouse.maxSimultaneousVenues}</b> venues drawing every <b>{report.warehouse.reviewPeriod} days</b> while supplier lead time runs. If the stock dips below safety, increase s.</div>
        </div>
      </div>
    </Card>
  );
}

function TcoTab({ item, report }) {
  const [target, setTarget] = useState(() => item.unitCost ? +(item.unitCost * 1.5).toFixed(2) : 7.0);
  if (!report.tco) {
    return <Card title="TCO Analysis"><div className="empty"><h3>Pricing not set</h3><p>Add a unit cost and shipping cost to this item to see TCO breakdowns.</p></div></Card>;
  }

  const finder = ProcEngine.tcoTarget(item, target);
  const highlightCases = finder.reachable ? finder.minCases : null;

  return (
    <div className="stack">
      <Card title="TCO by Order Size" right={
        <div className="row" style={{gap:8}}>
          <span className="muted" style={{fontSize:12, letterSpacing:'0.04em', textTransform:'uppercase'}}>Target $/unit</span>
          <div className="numbox">
            <button onClick={()=>setTarget(t => +Math.max((item.unitCost || 0) + 0.05, t - 0.5).toFixed(2))}>−</button>
            <input value={target} type="number" step="0.5" min={item.unitCost || 0} onChange={(e)=>setTarget(+e.target.value || 0)}/>
            <button onClick={()=>setTarget(t => +(t + 0.5).toFixed(2))}>+</button>
          </div>
        </div>
      }>
        <div className="tco-grid">
          {report.tco.map(r => (
            <div key={r.cases} className={`tco-cell ${highlightCases && r.cases === highlightCases ? 'target' : ''} ${r.tcoPerUnit <= target ? 'meets' : ''}`}>
              <div className="cases">{r.cases} {r.cases === 1 ? 'case' : 'cases'}</div>
              <div className="price">${r.tcoPerUnit}</div>
              <div className="units">{r.units} units · {fmt$(r.total)}</div>
            </div>
          ))}
        </div>

        {finder.reachable && (
          <div className="diag-card ok" style={{marginTop:18}}>
            <div className="diag-icon"><img src={ICON('check-circle')} alt=""/></div>
            <div>
              <div className="diag-title">Minimum order to hit ${target.toFixed(2)}/unit</div>
              <div className="diag-text">
                Order <b>{finder.actualQty} units</b> ({finder.minCases} {finder.minCases === 1 ? 'case' : 'cases'} of {item.caseSize}) — actual TCO <b>${finder.actualTco.toFixed(2)}/unit</b>, total {fmt$(finder.totalCost)}.
                {finder.note && <><br/><span className="muted" style={{fontSize:12}}>{finder.note}</span></>}
                {!finder.note && <><br/><span className="muted" style={{fontSize:12}}>Math: ⌈{item.shippingCost} ÷ ({target} − {item.unitCost})⌉ = {finder.minQty} units, rounded up to {finder.minCases} {finder.minCases === 1 ? 'case' : 'cases'}.</span></>}
              </div>
            </div>
          </div>
        )}
        {!finder.reachable && (
          <div className="diag-card warn" style={{marginTop:18}}>
            <div className="diag-icon"><img src={ICON('error')} alt=""/></div>
            <div>
              <div className="diag-title">Target Not Reachable</div>
              <div className="diag-text">{finder.reason} Either raise the target, negotiate shipping, or change shipping type.</div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── PAR Advisor ───
function ParAdvisorPage({ items, reports, onApplyDepletion, onToast }) {
  const [breakageDays, setBreakageDays] = useState(7);
  const [orderDelayDays, setOrderDelayDays] = useState(3);
  const [supplierDelayDays, setSupplierDelayDays] = useState(7);
  const [depletionData, setDepletionData] = useState([]);
  const fileRef = React.useRef(null);

  const rows = [];
  items.forEach((it) => {
    it.venues.forEach((v) => {
      const advice = ProcEngine.advisePar(it.subcategory, v.monthlyDemand, it.leadTime, breakageDays + orderDelayDays, v.par);
      rows.push({ item: it.name, sku: it.sku, venue: v.name, par: v.par, monthly: v.monthlyDemand, ...advice });
    });
  });

  const tooLow = rows.filter(r => r.verdict === 'too-low').length;
  const tooHigh = rows.filter(r => r.verdict === 'too-high').length;
  const good = rows.length - tooLow - tooHigh;

  const depletionAnalysis = useMemo(() => depletionData.map(d => {
    const item = items.find(it => it.name.toLowerCase() === d.itemName.toLowerCase());
    if (!item) return { ...d, error: `Item "${d.itemName}" not found in catalog` };
    const venue = item.venues.find(v => v.name.toLowerCase() === d.venueName.toLowerCase());
    if (!venue) return { ...d, item, error: `Venue "${d.venueName}" not in ${item.name}` };
    return { ...d, item, venue, ...ProcEngine.analyzeDepletion(item, venue, d.observed) };
  }), [depletionData, items]);

  const handleDepletionImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dRows = await parseDepletionFromFile(file);
      if (dRows.length === 0) { onToast?.('No depletion rows found'); return; }
      setDepletionData(dRows);
      onToast?.(`Loaded ${dRows.length} depletion row${dRows.length === 1 ? '' : 's'}`);
    } catch (err) {
      console.error(err);
      onToast?.(`Import failed: ${err.message}`);
    }
  };

  const applyAll = () => {
    const valid = depletionAnalysis.filter(d => d.item && d.venue && !d.error);
    if (valid.length === 0) { onToast?.('Nothing to apply — all rows have errors'); return; }
    onApplyDepletion?.(valid.map(d => ({ itemId: d.item.id, venueName: d.venue.name, observed: d.observed })));
    onToast?.(`Applied ${valid.length} venue${valid.length === 1 ? '' : 's'}`);
    setDepletionData([]);
  };

  const allIssues = depletionAnalysis.flatMap(d => (d.issues || []).map((iss, j) => ({ ...iss, key: `${d.itemName}-${d.venueName}-${j}`, label: `${d.itemName} · ${d.venueName}` })));

  return (
    <div className="stack" style={{gap:20}}>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={handleDepletionImport}/>

      <div className="kpi-row three">
        <Kpi label="PARs Aligned" value={good} sub={`${rows.length} rows analyzed`}/>
        <Kpi label="Below Recommended" value={tooLow} sub="At risk of stockout"/>
        <Kpi label="Excessive" value={tooHigh} sub="Carrying too much"/>
      </div>

      <Card title="Risk Buffers" right={<span className="muted" style={{fontSize:12}}>Applied to venue PAR</span>}>
        <div className="form-grid">
          <NumField label="Breakage / Loss Spike" value={breakageDays} onChange={setBreakageDays} suffix="extra days" hint="Bad weekend, new staff, big event"/>
          <NumField label="Venue Ordering Delay" value={orderDelayDays} onChange={setOrderDelayDays} suffix="extra days" hint="Manager forgets, slow approval"/>
          <NumField label="Supplier Delay (warehouse-handled)" value={supplierDelayDays} onChange={setSupplierDelayDays} suffix="extra days" hint="Absorbed by warehouse, not added to venue PAR"/>
        </div>
      </Card>

      <Card title="Per-Venue PAR Diagnostic">
        <table className="tbl">
          <thead>
            <tr>
              <th>Item · Venue</th>
              <th className="right">Monthly Demand</th>
              <th className="right">Current PAR</th>
              <th className="right">Ideal PAR</th>
              <th className="right">Realistic PAR</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <div className="name">{r.venue}</div>
                  <div className="sku">{r.item}</div>
                </td>
                <td className="right num">{r.monthly}/mo</td>
                <td className="right num">{r.par}</td>
                <td className="right num">{r.idealPar}</td>
                <td className="right num">{r.realisticPar}</td>
                <td>
                  {r.verdict === 'too-low' && <Pill tone="bad">Too Low — Raise to {r.realisticPar}</Pill>}
                  {r.verdict === 'too-high' && <Pill tone="warn">Too High — Consider {r.realisticPar}</Pill>}
                  {r.verdict === 'good' && <Pill tone="ok">Aligned</Pill>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Depletion Data Analysis" right={
        <div className="row" style={{gap:8}}>
          {depletionData.length > 0 && (
            <>
              <Btn variant="ghost" size="sm" onClick={()=>setDepletionData([])}>Clear</Btn>
              <Btn size="sm" onClick={applyAll}>Apply to Items</Btn>
            </>
          )}
          <Btn variant="ghost" size="sm" leading="download" onClick={downloadImportTemplate}>Template</Btn>
          <Btn variant="ghost" size="sm" leading="upload" onClick={()=>fileRef.current?.click()}>Import Depletion</Btn>
        </div>
      }>
        {depletionData.length === 0 ? (
          <div className="empty">
            <h3>No depletion data loaded</h3>
            <p>Upload an .xlsx with columns: <b>Item</b> · <b>Venue</b> · <b>Observed Monthly Demand</b>. Each row is matched to a venue in the catalog and compared against its estimate and the industry attrition rate.</p>
          </div>
        ) : (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Item · Venue</th>
                  <th className="right">Estimate</th>
                  <th className="right">Observed</th>
                  <th className="right">Gap</th>
                  <th className="right">Attrition Floor</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {depletionAnalysis.map((d, i) => (
                  <tr key={i}>
                    <td>
                      <div className="name">{d.itemName} · {d.venueName}</div>
                      {d.error && <div className="sku" style={{color:'var(--woody-error)'}}>{d.error}</div>}
                    </td>
                    <td className="right num">{d.estimate != null ? `${d.estimate}/mo` : '—'}</td>
                    <td className="right num">{d.observed}/mo</td>
                    <td className="right num">{d.gapPct != null ? `${d.gapPct > 0 ? '+' : ''}${d.gapPct}%` : '—'}</td>
                    <td className="right num">{d.expectedFromAttrition != null ? `${d.expectedFromAttrition}/mo` : '—'}</td>
                    <td>{d.error
                      ? <Pill tone="bad">Skip</Pill>
                      : <Pill tone={d.severity === 'bad' ? 'bad' : d.severity === 'warn' ? 'warn' : 'ok'}>
                          {d.severity === 'bad' ? 'Under-provisioned' : d.severity === 'warn' ? 'Review' : 'Aligned'}
                        </Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allIssues.length > 0 && (
              <>
                <hr className="rule" style={{margin:'14px 0 10px'}}/>
                <div className="stack-sm">
                  {allIssues.map(iss => (
                    <div key={iss.key} className={`diag-card ${iss.tone === 'ok' ? 'ok' : iss.tone === 'bad' ? 'bad' : 'warn'}`}>
                      <div className="diag-icon"><img src={ICON(iss.tone === 'ok' ? 'check-circle' : iss.tone === 'bad' ? 'error' : 'help-outlined')} alt=""/></div>
                      <div>
                        <div className="diag-title">{iss.label}</div>
                        <div className="diag-text">{iss.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Orders Page ───
function OrdersPage({ items, reports, recentPOs }) {
  const [tab, setTab] = useState('suggested');

  // build suggested POs from reports, grouped by supplier
  const suggested = [];
  reports.forEach(r => {
    r.venues.forEach(v => {
      if (v.needNowCases > 0) suggested.push({
        item: r.item, dest: v.name, units: v.needNowCases, cases: v.needNowPacks, kind: 'venue',
        cost: r.item.unitCost ? +(v.needNowCases * r.item.unitCost).toFixed(2) : null,
      });
    });
    if (r.warehouse.warehouseNeedCases > 0) suggested.push({
      item: r.item, dest: 'Warehouse', units: r.warehouse.warehouseNeedCases, cases: Math.floor(r.warehouse.warehouseNeedCases / r.item.caseSize), kind: 'wh',
      cost: r.item.unitCost ? +(r.warehouse.warehouseNeedCases * r.item.unitCost).toFixed(2) : null,
    });
  });

  // group by supplier
  const grouped = {};
  suggested.forEach(o => {
    const k = o.item.supplier;
    if (!grouped[k]) grouped[k] = { supplier: k, contact: o.item.supplierContact, lines: [], total: 0 };
    grouped[k].lines.push(o);
    grouped[k].total += (o.cost || 0);
  });
  const groups = Object.values(grouped);

  return (
    <div className="stack" style={{gap:18}}>
      <div className="row between">
        <div className="status-bar">
          <div className={`seg ${tab==='suggested'?'on':''}`} onClick={()=>setTab('suggested')}>Suggested</div>
          <div className={`seg ${tab==='active'?'on':''}`} onClick={()=>setTab('active')}>Active</div>
          <div className={`seg ${tab==='received'?'on':''}`} onClick={()=>setTab('received')}>Received</div>
        </div>
        <div className="row" style={{gap:8}}>
          <Btn variant="ghost" size="sm" leading="download" onClick={()=>exportSuggestedPOsXlsx(reports)}>Export</Btn>
          <Btn size="sm" leading="plus-bkg">New PO</Btn>
        </div>
      </div>

      {tab === 'suggested' && (
        groups.length === 0
          ? <Card><div className="empty"><h3>All caught up</h3><p>No suggested orders right now. Items are at PAR and the warehouse is above its reorder point.</p></div></Card>
          : <div className="stack">
              {groups.map(g => (
                <Card key={g.supplier} title={g.supplier} right={<div className="row" style={{gap:14}}>
                  <span className="muted" style={{fontSize:12}}>{g.lines.length} lines</span>
                  <span className="amt">{fmt$(g.total)}</span>
                  <Btn size="sm">Issue PO</Btn>
                </div>}>
                  <div className="muted" style={{fontSize:12, marginTop:-4, marginBottom:14}}>{g.contact}</div>
                  <table className="tbl">
                    <thead><tr>
                      <th>Item</th><th>Destination</th><th className="right">Units</th><th className="right">Cases</th><th className="right">Est. Cost</th>
                    </tr></thead>
                    <tbody>
                      {g.lines.map((l, i) => (
                        <tr key={i}>
                          <td><div className="name">{l.item.name}</div><div className="sku">{l.item.sku}</div></td>
                          <td>{l.kind === 'wh' ? <Pill tone="info">Warehouse</Pill> : <Pill tone="neutral">{l.dest}</Pill>}</td>
                          <td className="right num">{l.units}</td>
                          <td className="right num">{l.cases}</td>
                          <td className="right num">{fmt$(l.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ))}
            </div>
      )}

      {tab === 'active' && (
        <Card>
          <table className="tbl">
            <thead><tr><th>PO #</th><th>Item</th><th>Supplier</th><th>Destination</th><th className="right">Units</th><th className="right">Total</th><th>Placed</th><th>ETA</th><th>Status</th></tr></thead>
            <tbody>
              {recentPOs.filter(p => p.status !== 'received').map(p => (
                <tr key={p.id}>
                  <td><b style={{fontFamily:'var(--font-mono)', fontSize:13}}>{p.id}</b></td>
                  <td>{p.item}</td>
                  <td className="muted" style={{fontSize:13}}>{p.supplier}</td>
                  <td>{p.dest}</td>
                  <td className="right num">{p.units}</td>
                  <td className="right num">{fmt$(p.total)}</td>
                  <td className="muted" style={{fontSize:13}}>{p.placed}</td>
                  <td className="num">{p.eta}</td>
                  <td>{p.status === 'in-transit' ? <Pill tone="info">In Transit</Pill> : <Pill tone="warn">Placed</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'received' && (
        <Card>
          <table className="tbl">
            <thead><tr><th>PO #</th><th>Item</th><th>Supplier</th><th>Destination</th><th className="right">Units</th><th className="right">Total</th><th>Received</th></tr></thead>
            <tbody>
              {recentPOs.filter(p => p.status === 'received').map(p => (
                <tr key={p.id}>
                  <td><b style={{fontFamily:'var(--font-mono)', fontSize:13}}>{p.id}</b></td>
                  <td>{p.item}</td>
                  <td className="muted" style={{fontSize:13}}>{p.supplier}</td>
                  <td>{p.dest}</td>
                  <td className="right num">{p.units}</td>
                  <td className="right num">{fmt$(p.total)}</td>
                  <td className="num">{p.eta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ─── Item Edit / New Modal ───
function ItemEditModal({ item, onSave, onClose }) {
  const [draft, setDraft] = useState(item);
  const set = (f, v) => setDraft(d => ({ ...d, [f]: v }));
  return (
    <Modal title={item.id ? 'Edit Item' : 'New Item'} onClose={onClose} width={680} actions={<>
      <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
      <Btn size="sm" onClick={()=>onSave(draft)}>Save</Btn>
    </>}>
      <div className="form-grid">
        <TextField label="Item Name" value={draft.name} onChange={(v)=>set('name', v)} hint="e.g. Serving Tong Medium"/>
        <TextField label="SKU" value={draft.sku} onChange={(v)=>set('sku', v)}/>
        <SelectField label="Category" value={draft.category} onChange={(v)=>set('category', v)} options={['OS&E','Collateral','Other Items']}/>
        <SelectField label="Subcategory" value={draft.subcategory} onChange={(v)=>set('subcategory', v)} options={['Glassware - Delicate','Glassware - Sturdy','Flatware','Dinnerware','Bar Tools','Smallwares','Consumable','Equipment']}/>
        <NumField label="Case / Pack Size" value={draft.caseSize} onChange={(v)=>set('caseSize', v)}/>
        <NumField label="Lead Time" value={draft.leadTime} onChange={(v)=>set('leadTime', v)} suffix="days"/>
        <NumField label="Unit Cost" value={draft.unitCost} onChange={(v)=>set('unitCost', v)} suffix="USD"/>
        <NumField label="Shipping Cost" value={draft.shippingCost} onChange={(v)=>set('shippingCost', v)} suffix="USD"/>
        <SelectField label="Shipping Type" value={draft.shippingType} onChange={(v)=>set('shippingType', v)} options={[{value:'flat',label:'Flat per shipment'},{value:'per_case',label:'Per case'},{value:'per_unit',label:'Per unit'}]}/>
        <TextField label="Supplier" value={draft.supplier} onChange={(v)=>set('supplier', v)}/>
        <div className="span-full"><TextField label="Supplier Contact" value={draft.supplierContact} onChange={(v)=>set('supplierContact', v)}/></div>
      </div>
    </Modal>
  );
}

Object.assign(window, { DashboardPage, ItemsPage, ItemDetail, ParAdvisorPage, OrdersPage, ItemEditModal, statusForItem });
