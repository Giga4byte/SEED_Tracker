import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "seed_doc_tracker_v1";

const STATUS_CONFIG = {
  "Pending": { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", dot: "#f59e0b" },
  "In Progress": { color: "#3b82f6", bg: "rgba(59,130,246,0.12)", dot: "#3b82f6" },
  "Done": { color: "#10b981", bg: "rgba(16,185,129,0.12)", dot: "#10b981" },
};

const defaultBatchData = (batchName) => ({
  id: Date.now().toString(),
  name: batchName,
  seedMembers: [],
  events: [],
  createdAt: new Date().toISOString(),
});

const emptyEvent = (index) => ({
  id: Date.now().toString() + Math.random(),
  slNo: index + 1,
  eventName: "",
  assignedTo: "Execom",
  deadline: "",
  reassigned: "",
  foldersCount: 0,
  momsCount: 0,
  status: "Pending",
  notes: "",
});

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { batches: [], activeBatchId: null };
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export default function App() {
  const [data, setData] = useState(() => loadData());
  const [view, setView] = useState("home"); // home | batch | newBatch
  const [newBatchName, setNewBatchName] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [editingCell, setEditingCell] = useState(null); // { eventId, field }
  const [editValue, setEditValue] = useState("");
  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const inputRef = useRef();

  useEffect(() => { saveData(data); }, [data]);
  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus();
  }, [editingCell]);

  const activeBatch = data.batches.find(b => b.id === data.activeBatchId);

  function createBatch() {
    if (!newBatchName.trim()) return;
    const batch = defaultBatchData(newBatchName.trim());
    const updated = {
      batches: [...data.batches, batch],
      activeBatchId: batch.id,
    };
    setData(updated);
    setNewBatchName("");
    setView("batch");
  }

  function switchBatch(id) {
    setData(d => ({ ...d, activeBatchId: id }));
    setView("batch");
  }

  function deleteBatch(id) {
    const updated = {
      batches: data.batches.filter(b => b.id !== id),
      activeBatchId: data.activeBatchId === id
        ? (data.batches.find(b => b.id !== id)?.id || null)
        : data.activeBatchId,
    };
    setData(updated);
    if (updated.activeBatchId === null) setView("home");
    else setView("batch");
    setConfirmDelete(null);
  }

  function addMember() {
    if (!newMemberName.trim() || !activeBatch) return;
    updateBatch(activeBatch.id, b => ({
      ...b,
      seedMembers: [...b.seedMembers, { id: Date.now().toString(), name: newMemberName.trim() }]
    }));
    setNewMemberName("");
  }

  function removeMember(memberId) {
    updateBatch(activeBatch.id, b => ({
      ...b,
      seedMembers: b.seedMembers.filter(m => m.id !== memberId),
      events: b.events.map(e => e.assignedTo === b.seedMembers.find(m => m.id === memberId)?.name
        ? { ...e, assignedTo: "Execom" } : e)
    }));
  }

  function addEvent() {
    if (!activeBatch) return;
    updateBatch(activeBatch.id, b => {
      const newEv = emptyEvent(b.events.length);
      return { ...b, events: [...b.events, newEv] };
    });
  }

  function removeEvent(eventId) {
    updateBatch(activeBatch.id, b => ({
      ...b,
      events: b.events.filter(e => e.id !== eventId).map((e, i) => ({ ...e, slNo: i + 1 }))
    }));
  }

  function updateBatch(batchId, updater) {
    setData(d => ({
      ...d,
      batches: d.batches.map(b => b.id === batchId ? updater(b) : b)
    }));
  }

  function updateEventField(eventId, field, value) {
    updateBatch(activeBatch.id, b => ({
      ...b,
      events: b.events.map(e => e.id === eventId ? { ...e, [field]: value } : e)
    }));
  }

  function startEdit(eventId, field, currentValue) {
    setEditingCell({ eventId, field });
    setEditValue(String(currentValue));
  }

  function commitEdit() {
    if (!editingCell) return;
    updateEventField(editingCell.eventId, editingCell.field, editValue);
    setEditingCell(null);
  }

  // Stats for a batch
  function batchStats(batch) {
    const total = batch.events.length;
    const done = batch.events.filter(e => e.status === "Done").length;
    const inProgress = batch.events.filter(e => e.status === "In Progress").length;
    const totalFolders = batch.events.reduce((s, e) => s + Number(e.foldersCount || 0), 0);
    const totalMoms = batch.events.reduce((s, e) => s + Number(e.momsCount || 0), 0);
    return { total, done, inProgress, totalFolders, totalMoms };
  }

  const memberAssignmentStats = (batch) => {
    const stats = {};
    for (const m of batch.seedMembers) {
      const assigned = batch.events.filter(e => e.assignedTo === m.name);
      stats[m.name] = {
        events: assigned.length,
        folders: assigned.reduce((s, e) => s + Number(e.foldersCount || 0), 0),
        moms: assigned.reduce((s, e) => s + Number(e.momsCount || 0), 0),
        done: assigned.filter(e => e.status === "Done").length,
      };
    }
    return stats;
  };

  const assigneeOptions = activeBatch
    ? ["Execom", ...activeBatch.seedMembers.map(m => m.name)]
    : ["Execom"];

  return (
    <div style={styles.root}>
      <style>{css}</style>

      {/* SIDEBAR */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>
          <span style={styles.logoIcon}>⟁</span>
          <span style={styles.logoText}>SEED<br/><span style={styles.logoSub}>Doc Tracker</span></span>
        </div>

        <div style={styles.sidebarSection}>BATCHES</div>
        {data.batches.map(b => (
          <div
            key={b.id}
            style={{
              ...styles.batchItem,
              ...(data.activeBatchId === b.id && view === "batch" ? styles.batchItemActive : {})
            }}
            onClick={() => switchBatch(b.id)}
          >
            <span style={styles.batchDot} />
            <span style={styles.batchItemName}>{b.name}</span>
            <span
              style={styles.batchDelete}
              onClick={e => { e.stopPropagation(); setConfirmDelete(b.id); }}
              title="Delete batch"
            >×</span>
          </div>
        ))}

        <button style={styles.newBatchBtn} onClick={() => setView("newBatch")}>
          + New Batch
        </button>

        <div style={styles.sidebarFooter}>
          Documentation Team<br/>
          <span style={{ opacity: 0.4, fontSize: "10px" }}>SEED Club</span>
        </div>
      </aside>

      {/* MAIN */}
      <main style={styles.main}>

        {/* HOME / LANDING */}
        {view === "home" && (
          <div style={styles.centerPage}>
            <div style={styles.heroIcon}>⟁</div>
            <h1 style={styles.heroTitle}>SEED Documentation Tracker</h1>
            <p style={styles.heroSub}>Each execom batch gets its own space. Create your batch to get started.</p>
            <button style={styles.heroCta} onClick={() => setView("newBatch")}>
              Create Your Batch →
            </button>
          </div>
        )}

        {/* NEW BATCH */}
        {view === "newBatch" && (
          <div style={styles.centerPage}>
            <h2 style={styles.pageTitle}>New Execom Batch</h2>
            <p style={styles.pageSub}>Give this batch a name, e.g. <em>Execom 2024–25</em></p>
            <div style={styles.inputRow}>
              <input
                style={styles.bigInput}
                placeholder="Batch name..."
                value={newBatchName}
                onChange={e => setNewBatchName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createBatch()}
                autoFocus
              />
              <button style={styles.heroCta} onClick={createBatch}>Create →</button>
            </div>
          </div>
        )}

        {/* BATCH VIEW */}
        {view === "batch" && activeBatch && (() => {
          const stats = batchStats(activeBatch);
          const mStats = memberAssignmentStats(activeBatch);
          return (
            <div style={styles.batchView}>
              {/* Header */}
              <div style={styles.batchHeader}>
                <div>
                  <h1 style={styles.batchTitle}>{activeBatch.name}</h1>
                  <span style={styles.batchDate}>
                    Created {new Date(activeBatch.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                <div style={styles.headerActions}>
                  <button style={styles.membersBtn} onClick={() => setShowMemberPanel(p => !p)}>
                    👥 Seed Members ({activeBatch.seedMembers.length})
                  </button>
                </div>
              </div>

              {/* Stats bar */}
              <div style={styles.statsBar}>
                <StatCard label="Total Events" value={stats.total} accent="#e2c27d" />
                <StatCard label="Done" value={stats.done} accent="#10b981" />
                <StatCard label="In Progress" value={stats.inProgress} accent="#3b82f6" />
                <StatCard label="Total Folders" value={stats.totalFolders} accent="#a78bfa" />
                <StatCard label="Total MOMs" value={stats.totalMoms} accent="#f472b6" />
              </div>

              {/* Member Panel */}
              {showMemberPanel && (
                <div style={styles.memberPanel}>
                  <div style={styles.memberPanelHeader}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "15px", color: "#e2c27d" }}>Seed Members</span>
                    <button style={styles.closeBtn} onClick={() => setShowMemberPanel(false)}>×</button>
                  </div>
                  <div style={styles.memberList}>
                    {activeBatch.seedMembers.length === 0 && (
                      <span style={{ color: "#666", fontSize: "13px" }}>No members yet. Add below.</span>
                    )}
                    {activeBatch.seedMembers.map(m => (
                      <div key={m.id} style={styles.memberChip}>
                        <span style={styles.memberAvatar}>{m.name[0].toUpperCase()}</span>
                        <span style={styles.memberChipName}>{m.name}</span>
                        {mStats[m.name] && (
                          <span style={styles.memberMiniStats}>
                            {mStats[m.name].events}ev · {mStats[m.name].folders}f · {mStats[m.name].moms}m
                          </span>
                        )}
                        <button style={styles.removeMember} onClick={() => removeMember(m.id)}>×</button>
                      </div>
                    ))}
                  </div>
                  <div style={styles.addMemberRow}>
                    <input
                      style={styles.memberInput}
                      placeholder="Add member name..."
                      value={newMemberName}
                      onChange={e => setNewMemberName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addMember()}
                    />
                    <button style={styles.addMemberBtn} onClick={addMember}>Add</button>
                  </div>
                </div>
              )}

              {/* TABLE */}
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {["#", "Event Name", "Assigned To", "Deadline", "Reassigned", "Folders", "MOMs", "Status", "Notes", ""].map((h, i) => (
                        <th key={i} style={{ ...styles.th, ...(i === 0 ? { width: "40px" } : {}) }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeBatch.events.map((ev, idx) => (
                      <tr key={ev.id} style={styles.tr} className="table-row">
                        <td style={styles.td}><span style={styles.slNo}>{ev.slNo}</span></td>

                        {/* Event Name */}
                        <td style={styles.td} onClick={() => startEdit(ev.id, "eventName", ev.eventName)}>
                          {editingCell?.eventId === ev.id && editingCell?.field === "eventName"
                            ? <input ref={inputRef} style={styles.cellInput} value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()} />
                            : <span style={styles.cellText}>{ev.eventName || <span style={styles.placeholder}>Click to edit</span>}</span>
                          }
                        </td>

                        {/* Assigned To */}
                        <td style={styles.td}>
                          <select
                            style={styles.selectCell}
                            value={ev.assignedTo}
                            onChange={e => updateEventField(ev.id, "assignedTo", e.target.value)}
                          >
                            {assigneeOptions.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>

                        {/* Deadline */}
                        <td style={styles.td} onClick={() => startEdit(ev.id, "deadline", ev.deadline)}>
                          {editingCell?.eventId === ev.id && editingCell?.field === "deadline"
                            ? <input ref={inputRef} type="date" style={styles.cellInput} value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()} />
                            : <span style={styles.cellText}>{ev.deadline
                                ? new Date(ev.deadline + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                                : <span style={styles.placeholder}>—</span>}</span>
                          }
                        </td>

                        {/* Reassigned */}
                        <td style={styles.td}>
                          <select
                            style={{ ...styles.selectCell, color: ev.reassigned && ev.reassigned !== "" ? "#f472b6" : "#555" }}
                            value={ev.reassigned}
                            onChange={e => updateEventField(ev.id, "reassigned", e.target.value)}
                          >
                            <option value="">—</option>
                            {assigneeOptions.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>

                        {/* Folders */}
                        <td style={styles.td} onClick={() => startEdit(ev.id, "foldersCount", ev.foldersCount)}>
                          {editingCell?.eventId === ev.id && editingCell?.field === "foldersCount"
                            ? <input ref={inputRef} type="number" min="0" style={{ ...styles.cellInput, width: "50px" }}
                                value={editValue} onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()} />
                            : <span style={{ ...styles.cellText, textAlign: "center" }}>
                                <span style={styles.countBadge}>{ev.foldersCount}</span>
                              </span>
                          }
                        </td>

                        {/* MOMs */}
                        <td style={styles.td} onClick={() => startEdit(ev.id, "momsCount", ev.momsCount)}>
                          {editingCell?.eventId === ev.id && editingCell?.field === "momsCount"
                            ? <input ref={inputRef} type="number" min="0" style={{ ...styles.cellInput, width: "50px" }}
                                value={editValue} onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()} />
                            : <span style={{ ...styles.cellText, textAlign: "center" }}>
                                <span style={styles.countBadge}>{ev.momsCount}</span>
                              </span>
                          }
                        </td>

                        {/* Status */}
                        <td style={styles.td}>
                          <select
                            style={{
                              ...styles.selectCell,
                              color: STATUS_CONFIG[ev.status].color,
                              background: STATUS_CONFIG[ev.status].bg,
                              borderColor: STATUS_CONFIG[ev.status].color + "44",
                              fontWeight: "600",
                            }}
                            value={ev.status}
                            onChange={e => updateEventField(ev.id, "status", e.target.value)}
                          >
                            {Object.keys(STATUS_CONFIG).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>

                        {/* Notes */}
                        <td style={styles.td} onClick={() => startEdit(ev.id, "notes", ev.notes)}>
                          {editingCell?.eventId === ev.id && editingCell?.field === "notes"
                            ? <input ref={inputRef} style={{ ...styles.cellInput, minWidth: "140px" }} value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()} />
                            : <span style={{ ...styles.cellText, color: "#aaa" }}>
                                {ev.notes || <span style={styles.placeholder}>—</span>}
                              </span>
                          }
                        </td>

                        {/* Delete row */}
                        <td style={styles.td}>
                          <button style={styles.rowDelete} onClick={() => removeEvent(ev.id)}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {activeBatch.events.length === 0 && (
                  <div style={styles.emptyTable}>No events yet. Add one below ↓</div>
                )}
              </div>

              <button style={styles.addEventBtn} onClick={addEvent}>+ Add Event</button>

              {/* Per-member summary */}
              {activeBatch.seedMembers.length > 0 && (
                <div style={styles.memberSummary}>
                  <div style={styles.sectionLabel}>MEMBER WORKLOAD</div>
                  <div style={styles.memberCards}>
                    {activeBatch.seedMembers.map(m => {
                      const s = mStats[m.name] || {};
                      return (
                        <div key={m.id} style={styles.memberCard}>
                          <div style={styles.memberCardAvatar}>{m.name[0].toUpperCase()}</div>
                          <div style={styles.memberCardName}>{m.name}</div>
                          <div style={styles.memberCardStats}>
                            <div style={styles.memberStat}><span style={styles.memberStatVal}>{s.events || 0}</span><span style={styles.memberStatLbl}>Events</span></div>
                            <div style={styles.memberStat}><span style={styles.memberStatVal}>{s.folders || 0}</span><span style={styles.memberStatLbl}>Folders</span></div>
                            <div style={styles.memberStat}><span style={styles.memberStatVal}>{s.moms || 0}</span><span style={styles.memberStatLbl}>MOMs</span></div>
                            <div style={styles.memberStat}><span style={{ ...styles.memberStatVal, color: "#10b981" }}>{s.done || 0}</span><span style={styles.memberStatLbl}>Done</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </main>

      {/* CONFIRM DELETE MODAL */}
      {confirmDelete && (
        <div style={styles.modalOverlay} onClick={() => setConfirmDelete(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "#e2c27d", fontFamily: "'Playfair Display', serif", marginBottom: "8px" }}>Delete Batch?</h3>
            <p style={{ color: "#aaa", fontSize: "13px", marginBottom: "20px" }}>
              This will permanently delete <strong style={{ color: "#fff" }}>{data.batches.find(b => b.id === confirmDelete)?.name}</strong> and all its data.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button style={styles.cancelBtn} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button style={styles.deleteConfirmBtn} onClick={() => deleteBatch(confirmDelete)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ ...styles.statCard, borderColor: accent + "33" }}>
      <span style={{ ...styles.statVal, color: accent }}>{value}</span>
      <span style={styles.statLbl}>{label}</span>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0d0d; }
  .table-row:hover td { background: rgba(226,194,125,0.04) !important; }
  select option { background: #1a1a1a; color: #e0e0e0; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #111; }
  ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
  input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
`;

const styles = {
  root: {
    display: "flex", height: "100vh", background: "#0d0d0d",
    fontFamily: "'DM Mono', monospace", color: "#e0e0e0", overflow: "hidden",
  },
  sidebar: {
    width: "220px", minWidth: "220px", background: "#111", borderRight: "1px solid #1e1e1e",
    display: "flex", flexDirection: "column", padding: "0", overflow: "hidden",
  },
  sidebarLogo: {
    display: "flex", alignItems: "center", gap: "10px",
    padding: "24px 20px 20px", borderBottom: "1px solid #1e1e1e",
  },
  logoIcon: { fontSize: "24px", color: "#e2c27d", lineHeight: 1 },
  logoText: { fontSize: "13px", fontWeight: "600", color: "#e2c27d", lineHeight: "1.3", fontFamily: "'Playfair Display', serif" },
  logoSub: { fontSize: "10px", color: "#888", fontFamily: "'DM Mono', monospace", fontWeight: 400 },
  sidebarSection: {
    fontSize: "9px", letterSpacing: "0.15em", color: "#555",
    padding: "16px 20px 6px", fontWeight: "500",
  },
  batchItem: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "9px 20px", cursor: "pointer", transition: "background 0.15s",
    borderLeft: "2px solid transparent", position: "relative",
  },
  batchItemActive: {
    background: "rgba(226,194,125,0.08)", borderLeftColor: "#e2c27d",
  },
  batchDot: {
    width: "5px", height: "5px", borderRadius: "50%",
    background: "#444", flexShrink: 0,
  },
  batchItemName: { fontSize: "12px", color: "#ccc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  batchDelete: {
    color: "#555", fontSize: "16px", lineHeight: 1, cursor: "pointer",
    opacity: 0, transition: "opacity 0.15s",
    ":hover": { color: "#f87171" },
  },
  newBatchBtn: {
    margin: "12px 16px", padding: "8px 12px", background: "transparent",
    border: "1px dashed #333", borderRadius: "6px", color: "#888",
    fontSize: "11px", cursor: "pointer", transition: "all 0.15s", textAlign: "center",
    fontFamily: "'DM Mono', monospace",
  },
  sidebarFooter: {
    marginTop: "auto", padding: "16px 20px", fontSize: "10px", color: "#444",
    borderTop: "1px solid #1a1a1a", lineHeight: "1.6",
  },
  main: {
    flex: 1, overflow: "auto", background: "#0d0d0d",
  },
  centerPage: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    height: "100%", gap: "16px", padding: "40px",
  },
  heroIcon: { fontSize: "56px", color: "#e2c27d", lineHeight: 1 },
  heroTitle: {
    fontFamily: "'Playfair Display', serif", fontSize: "32px",
    color: "#e2c27d", textAlign: "center",
  },
  heroSub: { color: "#666", fontSize: "13px", textAlign: "center", maxWidth: "360px", lineHeight: "1.6" },
  heroCta: {
    padding: "10px 24px", background: "#e2c27d", color: "#0d0d0d",
    border: "none", borderRadius: "6px", cursor: "pointer",
    fontSize: "13px", fontWeight: "700", fontFamily: "'DM Mono', monospace",
    transition: "opacity 0.15s",
  },
  pageTitle: { fontFamily: "'Playfair Display', serif", fontSize: "26px", color: "#e2c27d" },
  pageSub: { color: "#666", fontSize: "13px" },
  inputRow: { display: "flex", gap: "10px", alignItems: "center" },
  bigInput: {
    padding: "10px 16px", background: "#1a1a1a", border: "1px solid #2e2e2e",
    borderRadius: "6px", color: "#e0e0e0", fontSize: "14px",
    fontFamily: "'DM Mono', monospace", outline: "none", width: "280px",
  },
  batchView: { padding: "32px 32px 60px", minHeight: "100%" },
  batchHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: "24px",
  },
  batchTitle: {
    fontFamily: "'Playfair Display', serif", fontSize: "28px", color: "#e2c27d",
    lineHeight: 1,
  },
  batchDate: { fontSize: "11px", color: "#555", display: "block", marginTop: "6px" },
  headerActions: { display: "flex", gap: "10px" },
  membersBtn: {
    padding: "8px 16px", background: "#1a1a1a", border: "1px solid #2e2e2e",
    borderRadius: "6px", color: "#ccc", cursor: "pointer", fontSize: "12px",
    fontFamily: "'DM Mono', monospace", transition: "border-color 0.15s",
  },
  statsBar: {
    display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap",
  },
  statCard: {
    flex: "1 1 100px", background: "#111", border: "1px solid",
    borderRadius: "10px", padding: "14px 16px",
    display: "flex", flexDirection: "column", gap: "4px",
  },
  statVal: { fontSize: "26px", fontFamily: "'Playfair Display', serif", lineHeight: 1 },
  statLbl: { fontSize: "10px", color: "#555", letterSpacing: "0.08em" },
  memberPanel: {
    background: "#111", border: "1px solid #2e2e2e", borderRadius: "10px",
    padding: "16px", marginBottom: "20px",
  },
  memberPanelHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px",
  },
  closeBtn: {
    background: "none", border: "none", color: "#666", fontSize: "20px",
    cursor: "pointer", lineHeight: 1,
  },
  memberList: { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px", minHeight: "20px" },
  memberChip: {
    display: "flex", alignItems: "center", gap: "6px",
    background: "#1a1a1a", border: "1px solid #2e2e2e",
    borderRadius: "20px", padding: "4px 10px 4px 6px",
  },
  memberAvatar: {
    width: "22px", height: "22px", background: "#e2c27d22",
    border: "1px solid #e2c27d44", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "10px", color: "#e2c27d", fontWeight: "600",
  },
  memberChipName: { fontSize: "12px", color: "#ccc" },
  memberMiniStats: { fontSize: "10px", color: "#555" },
  removeMember: {
    background: "none", border: "none", color: "#555", cursor: "pointer",
    fontSize: "14px", lineHeight: 1, padding: "0 2px",
  },
  addMemberRow: { display: "flex", gap: "8px" },
  memberInput: {
    flex: 1, padding: "7px 12px", background: "#1a1a1a",
    border: "1px solid #2e2e2e", borderRadius: "6px",
    color: "#e0e0e0", fontSize: "12px", fontFamily: "'DM Mono', monospace", outline: "none",
  },
  addMemberBtn: {
    padding: "7px 14px", background: "#e2c27d22", border: "1px solid #e2c27d44",
    borderRadius: "6px", color: "#e2c27d", cursor: "pointer",
    fontSize: "12px", fontFamily: "'DM Mono', monospace",
  },
  tableWrap: {
    overflowX: "auto", background: "#111", border: "1px solid #1e1e1e",
    borderRadius: "10px", marginBottom: "14px",
  },
  table: { width: "100%", borderCollapse: "collapse", minWidth: "900px" },
  th: {
    padding: "10px 12px", textAlign: "left", fontSize: "9px",
    letterSpacing: "0.12em", color: "#555", borderBottom: "1px solid #1e1e1e",
    fontWeight: "500", background: "#0f0f0f", whiteSpace: "nowrap",
  },
  tr: { borderBottom: "1px solid #191919", transition: "background 0.1s" },
  td: {
    padding: "8px 12px", fontSize: "12px", verticalAlign: "middle",
    cursor: "default",
  },
  slNo: {
    width: "24px", height: "24px", background: "#1a1a1a",
    borderRadius: "4px", display: "inline-flex", alignItems: "center",
    justifyContent: "center", fontSize: "10px", color: "#555",
  },
  cellText: { display: "block", color: "#ddd", cursor: "text" },
  cellInput: {
    background: "#1a1a1a", border: "1px solid #e2c27d66",
    borderRadius: "4px", color: "#e0e0e0", padding: "3px 6px",
    fontSize: "12px", outline: "none", fontFamily: "'DM Mono', monospace",
    width: "100%",
  },
  placeholder: { color: "#3a3a3a", fontStyle: "italic" },
  selectCell: {
    background: "#1a1a1a", border: "1px solid #2a2a2a",
    borderRadius: "5px", color: "#ccc", padding: "4px 6px",
    fontSize: "11px", cursor: "pointer", outline: "none",
    fontFamily: "'DM Mono', monospace", maxWidth: "130px",
  },
  countBadge: {
    display: "inline-block", padding: "2px 8px",
    background: "#1a1a1a", border: "1px solid #2a2a2a",
    borderRadius: "10px", fontSize: "11px", color: "#aaa",
    cursor: "text",
  },
  rowDelete: {
    background: "none", border: "none", color: "#3a3a3a",
    cursor: "pointer", fontSize: "16px", lineHeight: 1,
    transition: "color 0.15s", padding: "2px 4px",
  },
  emptyTable: {
    textAlign: "center", padding: "40px", color: "#444", fontSize: "13px",
  },
  addEventBtn: {
    padding: "8px 20px", background: "transparent",
    border: "1px dashed #2e2e2e", borderRadius: "6px",
    color: "#666", cursor: "pointer", fontSize: "12px",
    fontFamily: "'DM Mono', monospace", marginBottom: "32px",
    transition: "all 0.15s",
  },
  memberSummary: { marginTop: "8px" },
  sectionLabel: {
    fontSize: "9px", letterSpacing: "0.15em", color: "#555",
    marginBottom: "12px", fontWeight: "500",
  },
  memberCards: { display: "flex", gap: "12px", flexWrap: "wrap" },
  memberCard: {
    background: "#111", border: "1px solid #1e1e1e",
    borderRadius: "10px", padding: "16px", minWidth: "160px",
    flex: "1 1 160px",
  },
  memberCardAvatar: {
    width: "32px", height: "32px", background: "#e2c27d22",
    border: "1px solid #e2c27d44", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "14px", color: "#e2c27d", fontWeight: "700",
    marginBottom: "8px", fontFamily: "'Playfair Display', serif",
  },
  memberCardName: { fontSize: "13px", color: "#e0e0e0", marginBottom: "12px", fontWeight: "500" },
  memberCardStats: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" },
  memberStat: { display: "flex", flexDirection: "column", gap: "2px" },
  memberStatVal: { fontSize: "18px", color: "#e2c27d", fontFamily: "'Playfair Display', serif", lineHeight: 1 },
  memberStatLbl: { fontSize: "9px", color: "#555", letterSpacing: "0.08em" },
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
  },
  modal: {
    background: "#161616", border: "1px solid #2e2e2e",
    borderRadius: "12px", padding: "28px", maxWidth: "360px", width: "90%",
  },
  cancelBtn: {
    flex: 1, padding: "9px", background: "#1a1a1a",
    border: "1px solid #2e2e2e", borderRadius: "6px",
    color: "#aaa", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "12px",
  },
  deleteConfirmBtn: {
    flex: 1, padding: "9px", background: "#f87171",
    border: "none", borderRadius: "6px",
    color: "#1a1a1a", cursor: "pointer", fontFamily: "'DM Mono', monospace",
    fontSize: "12px", fontWeight: "700",
  },
};