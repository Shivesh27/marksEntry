import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const port = new URLSearchParams(window.location.search).get("port");
const API = `http://127.0.0.1:${port}`;
async function request(path, options = {}) {
  const response = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function App() {
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [data, setData] = useState(null);
  const [studentIndex, setStudentIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [marks, setMarks] = useState([]);
  const [notice, setNotice] = useState("Open a marks workbook to begin.");
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const visibleStudents = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.students.filter((student) => `${student.name} ${student.father}`.toLowerCase().includes(term));
  }, [data, search]);
  const student = data?.students[studentIndex];

  function displayStudent(next) {
    setStudentIndex(next);
    const row = data.students[next];
    setMarks(data.subjects.map((subject) => row?.[subject.column] ?? ""));
  }
  async function openWorkbook() {
    const path = await window.desktop.chooseWorkbook("Choose the marks workbook");
    if (!path) return;
    setBusy(true);
    try {
      const result = await request("/api/open", { method: "POST", body: JSON.stringify({ path }) });
      setSheets(result.sheets); setSelectedSheet(result.selected);
      const sheetData = await request("/api/data"); setData(sheetData); setStudentIndex(0); setMarks(sheetData.subjects.map((s) => sheetData.students[0]?.[s.column] ?? ""));
      setNotice(`${sheetData.students.length} students loaded.`);
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function changeSheet(event) {
    const sheet = event.target.value; setBusy(true);
    try {
      const result = await request("/api/select-sheet", { method: "POST", body: JSON.stringify({ sheet }) });
      setSelectedSheet(sheet); setData(result); setStudentIndex(0); setMarks(result.subjects.map((s) => result.students[0]?.[s.column] ?? "")); setNotice(`${result.students.length} students loaded.`);
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function saveMarks(next = null) {
    if (!student) return;
    setBusy(true);
    try {
      const result = await request("/api/marks", { method: "POST", body: JSON.stringify({ row: student.row, marks }) });
      data.subjects.forEach((subject, index) => { student[subject.column] = marks[index]; });
      setNotice(`Total ${result.total} · ${result.percentage}% — changes are ready to save.`);
      if (next !== null) displayStudent(Math.max(0, Math.min(data.students.length - 1, studentIndex + next)));
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function saveWorkbook() {
    setBusy(true); try { await request("/api/save", { method: "POST" }); setNotice("Workbook saved."); } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  function chooseStudent(row) { const index = data.students.findIndex((item) => item.row === Number(row)); if (index >= 0) displayStudent(index); }

  return <main>
    <header><div><p className="eyebrow">SRI KAKATIYA JUNIOR COLLEGE</p><h1>Marks Entry</h1></div><div className="actions"><button className="secondary" onClick={openWorkbook}>Open workbook</button><button className="secondary" disabled={!data} onClick={() => setImportOpen(true)}>Import students</button><button className="primary" disabled={!data || busy} onClick={saveWorkbook}>Save workbook</button></div></header>
    <section className="sheet-bar"><label>Marks entry sheet <select value={selectedSheet} onChange={changeSheet} disabled={!sheets.length}>{sheets.map((sheet) => <option key={sheet}>{sheet}</option>)}</select></label><span className={busy ? "status loading" : "status"}>{busy ? "Working…" : notice}</span></section>
    {!data ? <section className="empty"><div className="empty-icon">▦</div><h2>Your workbook, without the spreadsheet friction.</h2><p>Open a MARKS SHEET workbook to search students and record marks.</p><button className="primary" onClick={openWorkbook}>Choose workbook</button></section> : <section className="workspace">
      <aside><label className="search"><span>⌕</span><input placeholder="Search student or father…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="student-list">{visibleStudents.map((item) => <button className={item.row === student?.row ? "student active" : "student"} onClick={() => chooseStudent(item.row)} key={item.row}><strong>{item.name}</strong><small>{item.father || "Father name not entered"}</small></button>)}</div></aside>
      <article><div className="student-heading"><div><p className="eyebrow">STUDENT {studentIndex + 1} OF {data.students.length}</p><h2>{student?.name}</h2><p>{student?.father || "Father name not entered"}</p></div><div className="nav"><button className="secondary" disabled={studentIndex === 0 || busy} onClick={() => saveMarks(-1)}>← Previous</button><button className="primary" disabled={busy} onClick={() => saveMarks(1)}>Save & next →</button></div></div>
        <div className="marks-grid">{data.subjects.map((subject, index) => <label key={subject.column}>{subject.name}<input inputMode="decimal" value={marks[index] ?? ""} onChange={(event) => setMarks(marks.map((value, markIndex) => markIndex === index ? event.target.value : value))} onKeyDown={(event) => event.key === "Enter" && saveMarks(1)} placeholder="0–100" /></label>)}</div>
        <div className="hint">Press <kbd>Enter</kbd> to save and move to the next student. Marks must be between 0 and 100.</div>
      </article>
    </section>}
    {importOpen && <ImportDialog close={() => setImportOpen(false)} onImported={(result) => { setData(result.data); setSelectedSheet(result.data.sheet); setSheets([...sheets, result.data.sheet]); setStudentIndex(0); setMarks(result.data.subjects.map((s) => result.data.students[0]?.[s.column] ?? "")); setNotice(`${result.count} students imported and workbook saved.`); setImportOpen(false); }} />}
  </main>;
}

function ImportDialog({ close, onImported }) {
  const [sourcePath, setSourcePath] = useState(""); const [sheets, setSheets] = useState([]); const [sourceSheet, setSourceSheet] = useState(""); const [nameColumn, setNameColumn] = useState("C"); const [fatherColumn, setFatherColumn] = useState("D"); const [firstRow, setFirstRow] = useState("3"); const [newSheet, setNewSheet] = useState(""); const [error, setError] = useState("");
  async function chooseSource() { const path = await window.desktop.chooseWorkbook("Choose the student data workbook"); if (!path) return; try { const result = await request("/api/source-sheets", { method: "POST", body: JSON.stringify({ path }) }); setSourcePath(path); setSheets(result.sheets); setSourceSheet(result.sheets[0]); } catch (err) { setError(err.message); } }
  async function submit(event) { event.preventDefault(); try { const result = await request("/api/import", { method: "POST", body: JSON.stringify({ sourcePath, sourceSheet, nameColumn, fatherColumn, firstRow, newSheet }) }); onImported(result); } catch (err) { setError(err.message); } }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-title"><div><p className="eyebrow">NEW MARKS SHEET</p><h2>Import students</h2></div><button type="button" className="icon-button" onClick={close}>×</button></div><label>Student data workbook <button type="button" className="file-button" onClick={chooseSource}>{sourcePath ? sourcePath.split("/").pop() : "Choose workbook…"}</button></label><label>Source sheet <select value={sourceSheet} onChange={(e) => setSourceSheet(e.target.value)} disabled={!sheets.length}>{sheets.map((sheet) => <option key={sheet}>{sheet}</option>)}</select></label><div className="form-row"><label>Student-name column <input value={nameColumn} onChange={(e) => setNameColumn(e.target.value.toUpperCase())} maxLength="3" required /></label><label>Father-name column <input value={fatherColumn} onChange={(e) => setFatherColumn(e.target.value.toUpperCase())} maxLength="3" required /></label><label>First data row <input type="number" min="1" value={firstRow} onChange={(e) => setFirstRow(e.target.value)} required /></label></div><label>New marks-sheet name <input value={newSheet} onChange={(e) => setNewSheet(e.target.value)} placeholder="Example: MPC-IA" required /></label>{error && <p className="error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={!sourcePath}>Import students</button></div></form></div>;
}
createRoot(document.getElementById("root")).render(<App />);
