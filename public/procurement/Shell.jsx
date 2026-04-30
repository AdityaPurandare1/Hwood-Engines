// Sidebar + Topbar shell, customized for Procurement.
function Sidebar({ active, setActive, collapsed, setCollapsed }) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard',   icon: 'lists' },
    { id: 'items',     label: 'Items',       icon: 'finance' },
    { id: 'orders',    label: 'Purchase Orders', icon: 'sales' },
    { id: 'par',       label: 'PAR Advisor', icon: 'balance' },
    { id: 'venues',    label: 'Venues',      icon: 'members' },
    { id: 'suppliers', label: 'Suppliers',   icon: 'person' },
    { id: 'history',   label: 'History',     icon: 'history' },
  ];
  return (
    <aside className="sb">
      <div className="sb__hdr">
        <div className="sb__logo"><img src={ICON('hwoodicon')} alt=""/></div>
        {!collapsed && <span className="sb__brand">Procurement</span>}
        {!collapsed && <img className="sb__collapse" src={ICON('collapse')} onClick={()=>setCollapsed(true)} style={{filter:'invert(1)'}} alt="collapse"/>}
      </div>

      <nav className="sb__nav">
        {tabs.map(t => (
          <div key={t.id}
               data-screen-label={t.id}
               className={`sb__tab ${active===t.id ? 'active' : ''}`}
               onClick={()=>setActive(t.id)}>
            <img src={ICON(t.icon)} alt="" />
            {!collapsed && <span className="sb__label">{t.label}</span>}
          </div>
        ))}
      </nav>

      <div className="sb__foot">
        <div className="sb__user">
          <div className="sb__avatar">M</div>
          {!collapsed && <div>
            <div className="sb__hi">Hi, Michael</div>
            <div className="sb__email">michael@hwoodgroup.com</div>
          </div>}
        </div>
        {!collapsed && <div className="sb__copyright">© The h.wood Group 2026</div>}
        {collapsed && (
          <img className="sb__collapse" style={{opacity:0.7, cursor:'pointer', alignSelf:'center', filter:'invert(1)'}} src={ICON('expand')} onClick={()=>setCollapsed(false)} alt="expand"/>
        )}
      </div>
    </aside>
  );
}

function Topbar({ title, crumbs, actions }) {
  return (
    <header className="topbar">
      <div>
        {crumbs && <div className="topbar__crumbs">{crumbs}</div>}
        <div className="topbar__title">{title}</div>
      </div>
      <div className="topbar__actions">{actions}</div>
    </header>
  );
}

Object.assign(window, { Sidebar, Topbar });
