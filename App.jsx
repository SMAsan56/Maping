import React, { useState, useRef, useEffect, useCallback } from "react";
import { Plus, X, Image as ImageIcon, Trash2, RotateCcw, Download, Move } from "lucide-react";

// ---- style tokens (bright studio-wall theme) --------------------------
const COLORS = {
  board: "#f7f6f1",
  boardDot: "#00000014",
  paper: "#ffffff",
  paperEdge: "#00000012",
  ink: "#241f18",
  inkSoft: "#8a7d68",
  thread: "#a13a2c",
  link: "#4f6b43",
  pin: "#b8862e",
  moss: "#4f6b43",
  panel: "#fffdf9",
  panelBorder: "#e7e1d2",
};

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,600;1,500&family=Work+Sans:wght@400;500;600&display=swap');
.editable-empty:empty:before{ content: attr(data-placeholder); color: #b7ab97; pointer-events: none; }
.pin-handle{ transition: transform 0.1s ease; }
.pin-handle:hover{ transform: scale(1.35); }
.caption-handle{ opacity: 0.3; transition: opacity 0.1s ease; }
.caption-wrap:hover .caption-handle{ opacity: 0.9; }
`;

const DEFAULT_WIDTH = 168;
const MIN_WIDTH = 90;
const MAX_WIDTH = 420;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;

let uid = 1;
const nextId = (p) => `${p}${uid++}`;

function rotationFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return (h % 9) - 4;
}

function makeNode(parentId, x, y, title = "New branch") {
  return {
    id: nextId("n"),
    parentId,
    x,
    y,
    width: DEFAULT_WIDTH,
    title,
    desc: "",
    caption: "",
    captionSide: "bottom",
    branchLabel: "",
    image: null,
  };
}

function captionStyleFor(side) {
  const base = { position: "absolute" };
  if (side === "top") return { ...base, bottom: "100%", left: 0, width: "100%", marginBottom: 8 };
  if (side === "left") return { ...base, right: "100%", top: 0, width: 100, maxHeight: "100%", overflowY: "auto", marginRight: 8 };
  if (side === "right") return { ...base, left: "100%", top: 0, width: 100, maxHeight: "100%", overflowY: "auto", marginLeft: 8 };
  return { ...base, top: "100%", left: 0, width: "100%", marginTop: 8 }; // bottom (default)
}

function EditableText({ value, onChange, placeholder, className, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={className}
      style={{ whiteSpace: "pre-wrap", ...style }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onInput={(e) => onChange(e.currentTarget.textContent)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          document.execCommand("insertText", false, "\n");
        }
      }}
    />
  );
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 8) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let curY = y;
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = words[i] + " ";
      curY += lineHeight;
      lines++;
      if (lines >= maxLines) return curY;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, curY);
  return curY + lineHeight;
}

export default function CharacterMap() {
  const [nodes, setNodes] = useState(() => {
    const root = makeNode(null, 1300, 850, "Your OC");
    return { [root.id]: root };
  });
  const [links, setLinks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [linkDraft, setLinkDraft] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const containerRef = useRef(null);
  const dragState = useRef(null);
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);
  const cardRefs = useRef({});

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const root = Object.values(nodes)[0];
    setPan({ x: rect.width / 2 - root.x - root.width / 2, y: rect.height / 2 - root.y - 90 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const curScale = scaleRef.current;
      const curPan = panRef.current;
      const factor = Math.exp(-e.deltaY * 0.0012);
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, curScale * factor));
      const cx = (mouseX - curPan.x) / curScale;
      const cy = (mouseY - curPan.y) / curScale;
      setScale(newScale);
      setPan({ x: mouseX - newScale * cx, y: mouseY - newScale * cy });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && dragState.current?.type === "link") {
        dragState.current = null;
        setLinkDraft(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const updateNode = useCallback((id, patch) => {
    setNodes((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const updateLink = useCallback((id, patch) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const addLink = useCallback((a, b) => {
    if (!a || !b || a === b) return;
    setLinks((prev) => {
      const exists = prev.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
      if (exists) return prev;
      return [...prev, { id: nextId("l"), a, b, label: "" }];
    });
  }, []);

  const addChild = useCallback((parentId) => {
    setNodes((prev) => {
      const parent = prev[parentId];
      const siblings = Object.values(prev).filter((n) => n.parentId === parentId);
      const angle = (siblings.length * 47) % 360;
      const rad = (angle * Math.PI) / 180;
      const dist = 260;
      const child = makeNode(
        parentId,
        parent.x + Math.cos(rad) * dist,
        parent.y + Math.sin(rad) * dist + 40,
        "Untitled branch"
      );
      return { ...prev, [child.id]: child };
    });
  }, []);

  const deleteNode = useCallback((id) => {
    setNodes((prev) => {
      const toRemove = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const n of Object.values(prev)) {
          if (n.parentId && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
            toRemove.add(n.id);
            changed = true;
          }
        }
      }
      const next = { ...prev };
      toRemove.forEach((rid) => delete next[rid]);
      return next;
    });
    setLinks((prev) => prev.filter((l) => l.a !== id && l.b !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const resetAll = () => {
    uid = 1;
    const root = makeNode(null, 1300, 850, "Your OC");
    setNodes({ [root.id]: root });
    setLinks([]);
    setSelectedId(null);
    setLinkDraft(null);
    cardRefs.current = {};
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setScale(1);
      setPan({ x: rect.width / 2 - root.x - root.width / 2, y: rect.height / 2 - root.y - 90 });
    }
  };

  const toCanvas = (clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    const s = scaleRef.current;
    const p = panRef.current;
    return { x: (clientX - rect.left - p.x) / s, y: (clientY - rect.top - p.y) / s };
  };

  const onNodeMouseDown = (e, id) => {
    e.stopPropagation();
    const c = toCanvas(e.clientX, e.clientY);
    const n = nodes[id];
    dragState.current = { type: "node", id, offsetX: c.x - n.x, offsetY: c.y - n.y };
  };

  const onResizeMouseDown = (e, id) => {
    e.stopPropagation();
    const n = nodes[id];
    dragState.current = { type: "resize", id, startX: e.clientX, startWidth: n.width };
  };

  const onCaptionHandleMouseDown = (e, id) => {
    e.stopPropagation();
    e.preventDefault();
    dragState.current = { type: "caption", id };
  };

  const onPinMouseDown = (e, id) => {
    e.stopPropagation();
    e.preventDefault();
    dragState.current = { type: "link", sourceId: id };
    const c = toCanvas(e.clientX, e.clientY);
    setLinkDraft({ sourceId: id, x: c.x, y: c.y });
  };

  const onBoardMouseDown = (e) => {
    dragState.current = {
      type: "pan",
      startX: e.clientX,
      startY: e.clientY,
      startPan: { ...panRef.current },
    };
  };

  useEffect(() => {
    const onMove = (e) => {
      const d = dragState.current;
      if (!d) return;
      if (d.type === "pan") {
        setPan({ x: d.startPan.x + (e.clientX - d.startX), y: d.startPan.y + (e.clientY - d.startY) });
      } else if (d.type === "node") {
        const c = toCanvas(e.clientX, e.clientY);
        updateNode(d.id, { x: c.x - d.offsetX, y: c.y - d.offsetY });
      } else if (d.type === "resize") {
        const delta = (e.clientX - d.startX) / scaleRef.current;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, d.startWidth + delta));
        updateNode(d.id, { width: newWidth });
      } else if (d.type === "link") {
        const c = toCanvas(e.clientX, e.clientY);
        setLinkDraft({ sourceId: d.sourceId, x: c.x, y: c.y });
      } else if (d.type === "caption") {
        const el = cardRefs.current[d.id];
        if (el) {
          const rect = el.getBoundingClientRect();
          const cx = (rect.left + rect.right) / 2;
          const cy = (rect.top + rect.bottom) / 2;
          const dx = e.clientX - cx;
          const dy = e.clientY - cy;
          const halfW = rect.width / 2 || 1;
          const halfH = rect.height / 2 || 1;
          const side =
            Math.abs(dx / halfW) > Math.abs(dy / halfH) ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
          updateNode(d.id, { captionSide: side });
        }
      }
    };
    const onUp = (e) => {
      const d = dragState.current;
      if (d && d.type === "link") {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const targetEl = el && el.closest("[data-node-id]");
        if (targetEl) {
          const targetId = targetEl.getAttribute("data-node-id");
          if (targetId && targetId !== d.sourceId) addLink(d.sourceId, targetId);
        }
      }
      dragState.current = null;
      setLinkDraft(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateNode, addLink]);

  const handleImageUpload = (id, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateNode(id, { image: reader.result });
    reader.readAsDataURL(file);
  };

  const selected = selectedId ? nodes[selectedId] : null;

  const pinAnchor = (n) => ({ x: n.x + n.width / 2, y: n.y });
  const bodyAnchor = (n) => ({ x: n.x + n.width / 2, y: n.y + 70 });

  const lines = [
    ...Object.values(nodes)
      .filter((n) => n.parentId && nodes[n.parentId])
      .map((n) => {
        const p = bodyAnchor(nodes[n.parentId]);
        const c = pinAnchor(n);
        return {
          key: "p-" + n.id,
          x1: p.x,
          y1: p.y,
          x2: c.x,
          y2: c.y,
          value: n.branchLabel,
          onChange: (v) => updateNode(n.id, { branchLabel: v }),
          color: COLORS.thread,
        };
      }),
    ...links
      .map((l) => {
        const a = nodes[l.a];
        const b = nodes[l.b];
        if (!a || !b) return null;
        const pa = pinAnchor(a);
        const pb = pinAnchor(b);
        return {
          key: "l-" + l.id,
          x1: pa.x,
          y1: pa.y,
          x2: pb.x,
          y2: pb.y,
          value: l.label,
          onChange: (v) => updateLink(l.id, { label: v }),
          color: COLORS.link,
          dashed: true,
        };
      })
      .filter(Boolean),
  ].map((t) => {
    const midY = (t.y1 + t.y2) / 2;
    return {
      ...t,
      d: `M ${t.x1} ${t.y1} C ${t.x1} ${midY + 30}, ${t.x2} ${midY - 30}, ${t.x2} ${t.y2}`,
      midX: (t.x1 + t.x2) / 2,
      midY,
    };
  });

  const exportAsJpeg = async () => {
    setExporting(true);
    try {
      const ids = Object.keys(nodes);
      const heights = {};
      ids.forEach((id) => {
        const el = cardRefs.current[id];
        heights[id] = el ? el.offsetHeight : 160;
      });
      const pad = 70;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      ids.forEach((id) => {
        const n = nodes[id];
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y - 12);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + heights[id] + (n.caption ? 46 : 10));
      });
      minX -= pad;
      minY -= pad;
      maxX += pad;
      maxY += pad;
      const w = Math.max(400, maxX - minX);
      const h = Math.max(300, maxY - minY);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      const toX = (x) => x - minX;
      const toY = (y) => y - minY;

      ctx.fillStyle = COLORS.board;
      ctx.fillRect(0, 0, w, h);

      lines.forEach((t) => {
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 2;
        ctx.setLineDash(t.dashed ? [6, 5] : []);
        ctx.beginPath();
        const midY = (t.y1 + t.y2) / 2;
        ctx.moveTo(toX(t.x1), toY(t.y1));
        ctx.bezierCurveTo(toX(t.x1), toY(midY + 30), toX(t.x2), toY(midY - 30), toX(t.x2), toY(t.y2));
        ctx.stroke();
        ctx.setLineDash([]);
        if (t.value) {
          ctx.fillStyle = COLORS.inkSoft;
          ctx.font = "italic 13px Georgia, serif";
          ctx.textAlign = "center";
          ctx.fillText(t.value, toX(t.midX), toY(t.midY) - 16);
        }
      });

      const imgs = {};
      await Promise.all(
        ids
          .filter((id) => nodes[id].image)
          .map(
            (id) =>
              new Promise((res) => {
                const im = new window.Image();
                im.onload = () => {
                  imgs[id] = im;
                  res();
                };
                im.onerror = () => res();
                im.src = nodes[id].image;
              })
          )
      );

      ids.forEach((id) => {
        const n = nodes[id];
        const x = toX(n.x);
        const y = toY(n.y);
        const cw = n.width;
        const cardH = heights[id];

        ctx.beginPath();
        ctx.fillStyle = COLORS.pin;
        ctx.arc(x + cw / 2, y, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = COLORS.paper;
        ctx.fillRect(x, y, cw, cardH);

        let innerY = y + 8;
        if (imgs[id]) {
          const im = imgs[id];
          const imgW = cw - 16;
          const imgH = imgW * (im.naturalHeight / im.naturalWidth);
          ctx.drawImage(im, x + 8, innerY, imgW, imgH);
          innerY += imgH + 8;
        } else {
          ctx.fillStyle = "#ede7d8";
          ctx.fillRect(x + 8, innerY, cw - 16, 118);
          innerY += 118 + 8;
        }

        ctx.fillStyle = COLORS.ink;
        ctx.font = "600 15px Georgia, serif";
        ctx.textAlign = "left";
        ctx.fillText(n.title || "", x + 8, innerY + 12);
        innerY += 22;

        if (n.desc) {
          ctx.font = "12px 'Work Sans', sans-serif";
          ctx.fillStyle = COLORS.inkSoft;
          wrapText(ctx, n.desc, x + 8, innerY, cw - 16, 15);
        }

        if (n.caption) {
          ctx.font = "italic 13px Georgia, serif";
          ctx.fillStyle = COLORS.inkSoft;
          wrapText(ctx, n.caption, x, y + cardH + 20, cw + 90, 16);
        }
      });

      const url = canvas.toDataURL("image/jpeg", 0.92);
      const a = document.createElement("a");
      a.href = url;
      a.download = "character-map.jpg";
      a.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      style={{
        fontFamily: "'Work Sans', sans-serif",
        color: COLORS.ink,
        height: "100%",
        minHeight: 560,
        display: "flex",
        flexDirection: "column",
        background: COLORS.board,
      }}
    >
      <style>{GLOBAL_CSS}</style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: `1px solid ${COLORS.paperEdge}`,
          background: COLORS.panel,
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Fraunces', serif",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 22,
              color: COLORS.ink,
              lineHeight: 1,
            }}
          >
            the character board
          </div>
          <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 4 }}>
            Drag empty space to move around, scroll to zoom. Click any text to edit it. Drag from a pin to
            connect two characters.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={exportAsJpeg}
            disabled={exporting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: COLORS.moss,
              border: "none",
              color: "#fdfcf9",
              padding: "7px 12px",
              borderRadius: 5,
              fontSize: 13,
              cursor: exporting ? "default" : "pointer",
              opacity: exporting ? 0.7 : 1,
            }}
          >
            <Download size={14} /> {exporting ? "Exporting..." : "Export as JPEG"}
          </button>
          <button
            onClick={resetAll}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: `1px solid #00000022`,
              color: COLORS.inkSoft,
              padding: "7px 12px",
              borderRadius: 5,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <RotateCcw size={14} /> Start over
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onMouseDown={onBoardMouseDown}
        style={{
          position: "relative",
          flex: 1,
          overflow: "hidden",
          cursor: "grab",
          backgroundColor: COLORS.board,
          backgroundImage: `radial-gradient(${COLORS.boardDot} 1px, transparent 1px)`,
          backgroundSize: `${24 * scale}px ${24 * scale}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <svg width={1} height={1} style={{ overflow: "visible", position: "absolute", top: 0, left: 0 }}>
            {lines.map((t) => (
              <path
                key={t.key}
                d={t.d}
                fill="none"
                stroke={t.color}
                strokeWidth={2}
                strokeDasharray={t.dashed ? "5 4" : "0"}
                opacity={0.8}
              />
            ))}
            {linkDraft &&
              nodes[linkDraft.sourceId] &&
              (() => {
                const s = pinAnchor(nodes[linkDraft.sourceId]);
                return (
                  <path
                    d={`M ${s.x} ${s.y} L ${linkDraft.x} ${linkDraft.y}`}
                    stroke={COLORS.link}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    fill="none"
                    opacity={0.6}
                  />
                );
              })()}
          </svg>

          {lines.map((t) => (
            <input
              key={"lbl-" + t.key}
              value={t.value}
              onChange={(e) => t.onChange(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              placeholder="label..."
              style={{
                position: "absolute",
                left: t.midX,
                top: t.midY - 14,
                transform: "translate(-50%, -100%)",
                width: 110,
                fontSize: 11,
                fontStyle: "italic",
                textAlign: "center",
                fontFamily: "'Work Sans', sans-serif",
                color: COLORS.inkSoft,
                background: "transparent",
                border: "none",
                outline: "none",
                padding: 0,
                zIndex: 3,
              }}
            />
          ))}

          {Object.values(nodes).map((n) => {
            const rot = rotationFor(n.id);
            const isSelected = n.id === selectedId;
            return (
              <div
                key={n.id}
                data-node-id={n.id}
                onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(n.id);
                }}
                style={{
                  position: "absolute",
                  left: n.x,
                  top: n.y,
                  width: n.width,
                  transform: `rotate(${rot}deg)`,
                  cursor: "grab",
                  zIndex: isSelected ? 5 : 1,
                }}
              >
                <div
                  className="pin-handle"
                  onMouseDown={(e) => onPinMouseDown(e, n.id)}
                  title="Drag to connect to another character"
                  style={{
                    position: "absolute",
                    top: -6,
                    left: n.width / 2 - 6,
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: COLORS.pin,
                    boxShadow: "0 2px 3px #00000040",
                    border: "1px solid #8a6a1f",
                    zIndex: 4,
                    cursor: "crosshair",
                  }}
                />
                <div
                  ref={(el) => {
                    if (el) cardRefs.current[n.id] = el;
                  }}
                  style={{
                    position: "relative",
                    background: COLORS.paper,
                    padding: 8,
                    boxShadow: isSelected
                      ? `0 6px 16px #00000030, 0 0 0 2px ${COLORS.moss}`
                      : "0 3px 10px #00000022",
                    borderRadius: 2,
                  }}
                >
                  {n.image ? (
                    <div style={{ position: "relative", marginBottom: 8 }}>
                      <img
                        src={n.image}
                        alt=""
                        draggable={false}
                        style={{ display: "block", width: "100%", height: "auto", borderRadius: 1 }}
                      />
                      <div
                        onMouseDown={(e) => onResizeMouseDown(e, n.id)}
                        title="Drag to resize"
                        style={{
                          position: "absolute",
                          right: -4,
                          bottom: -4,
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          background: COLORS.moss,
                          border: "2px solid " + COLORS.paper,
                          cursor: "nwse-resize",
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: 118,
                        background: "#ede7d8",
                        borderRadius: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 8,
                      }}
                    >
                      <ImageIcon size={22} color={COLORS.inkSoft} />
                    </div>
                  )}
                  <input
                    value={n.title}
                    onChange={(e) => updateNode(n.id, { title: e.target.value })}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Type a name..."
                    style={{
                      width: "100%",
                      fontFamily: "'Fraunces', serif",
                      fontWeight: 600,
                      fontSize: 13.5,
                      lineHeight: 1.25,
                      marginBottom: 4,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      padding: 0,
                      color: COLORS.ink,
                      cursor: "text",
                    }}
                  />
                  <EditableText
                    value={n.desc}
                    onChange={(v) => updateNode(n.id, { desc: v })}
                    placeholder="Click to add notes..."
                    className="editable-empty"
                    style={{
                      fontSize: 11.5,
                      lineHeight: 1.4,
                      color: COLORS.inkSoft,
                      outline: "none",
                      minHeight: 14,
                      wordBreak: "break-word",
                    }}
                  />

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addChild(n.id);
                    }}
                    title="Add branch"
                    style={{
                      position: "absolute",
                      bottom: 6,
                      right: 6,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: COLORS.moss,
                      border: "2px solid " + COLORS.paper,
                      color: "#f7f6f1",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      boxShadow: "0 1px 4px #00000030",
                    }}
                  >
                    <Plus size={13} />
                  </button>

                  <div className="caption-wrap" style={{ ...captionStyleFor(n.captionSide), zIndex: 3 }}>
                    <div
                      className="caption-handle"
                      onMouseDown={(e) => onCaptionHandleMouseDown(e, n.id)}
                      title="Drag to move this note to any side of the card"
                      style={{
                        position: "absolute",
                        top: n.captionSide === "top" ? "auto" : -2,
                        bottom: n.captionSide === "top" ? -2 : "auto",
                        left: -2,
                        width: 14,
                        height: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "grab",
                        color: COLORS.inkSoft,
                        background: "#fffef9",
                        borderRadius: 3,
                      }}
                    >
                      <Move size={10} />
                    </div>
                    <EditableText
                      value={n.caption}
                      onChange={(v) => updateNode(n.id, { caption: v })}
                      placeholder="Click to add a note..."
                      className="editable-empty"
                      style={{
                        paddingLeft: 14,
                        fontFamily: "'Fraunces', serif",
                        fontStyle: "italic",
                        fontSize: 12.5,
                        lineHeight: 1.35,
                        color: COLORS.inkSoft,
                        outline: "none",
                        wordBreak: "break-word",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            height: "100%",
            width: 280,
            background: COLORS.panel,
            borderLeft: `1px solid ${COLORS.panelBorder}`,
            padding: 20,
            boxSizing: "border-box",
            overflowY: "auto",
            color: COLORS.ink,
            zIndex: 20,
            boxShadow: "-6px 0 18px #00000018",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 18 }}>{selected.title}</div>
            <button
              onClick={() => setSelectedId(null)}
              style={{ background: "none", border: "none", color: COLORS.inkSoft, cursor: "pointer" }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 14, lineHeight: 1.5 }}>
            Title, notes, and the floating note are all editable directly on the card — just click into them.
          </div>

          <label style={{ fontSize: 11.5, color: COLORS.inkSoft }}>Photo</label>
          <div style={{ marginTop: 6, marginBottom: 18 }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                padding: "7px 12px",
                border: `1px solid ${COLORS.panelBorder}`,
                borderRadius: 5,
                cursor: "pointer",
                color: COLORS.ink,
              }}
            >
              <ImageIcon size={14} /> {selected.image ? "Replace image" : "Upload image"}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleImageUpload(selected.id, e.target.files[0])}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => addChild(selected.id)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "9px 10px",
                background: COLORS.moss,
                border: "none",
                borderRadius: 5,
                color: "#fdfcf9",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <Plus size={14} /> Add branch
            </button>
            {selected.parentId && (
              <button
                onClick={() => deleteNode(selected.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "9px 12px",
                  background: "transparent",
                  border: `1px solid ${COLORS.thread}66`,
                  borderRadius: 5,
                  color: COLORS.thread,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
