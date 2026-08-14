window.__ModuleLoader__.load({
	id: "dsh-timeline",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region src/client/TimelineOverlay.tsx
		/**
		* @param props - runtime share (root kit) + the narrowed renderSlot and the
		*   framework-injected SessionProvider for the session child seat.
		*/
		function TimelineOverlay({ SessionProvider, renderSlot }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionProvider, {
				empty: () => null,
				children: () => renderSlot("timeline.rail", {})
			});
		}
		//#endregion
		//#region src/client/rail-logic.ts
		/**
		* Extract the plain text of a ContentBlock[] payload: the `text` of every
		* `{ type: 'text', text: string }` block, joined with a single space and
		* trimmed.
		* @param content - untrusted payload; anything that is not an array yields ''.
		*/
		function extractText(content) {
			if (!Array.isArray(content)) return "";
			const parts = [];
			for (const block of content) if (block !== null && typeof block === "object" && block.type === "text") {
				const text = block.text;
				if (typeof text === "string") parts.push(text);
			}
			return parts.join(" ").trim();
		}
		/**
		* First {@link PREVIEW_LENGTH} characters of a message, for the hover preview.
		* @param content - a ContentBlock[] payload.
		*/
		function extractPreview(content) {
			return extractText(content).slice(0, 80);
		}
		/**
		* Blue gradient dot color: newest (highest index) is deepest, oldest is
		* lightest — 72% lightness fading to 45%, like a Git commit graph.
		* @param index - dot position in the rail (0 = oldest).
		* @param total - number of dots.
		*/
		function dotColor(index, total) {
			return `hsl(218, 88%, ${72 - (total <= 1 ? 0 : index / (total - 1)) * 27}%)`;
		}
		//#endregion
		//#region src/client/TimelineRail.tsx
		/**
		* TimelineRail: a slim vertical dot rail on the right edge of the frame — one
		* dot per user question. Click a dot to smooth-scroll to that message; hover
		* to preview its first 80 characters. That's the whole plugin.
		*
		* Data sources (all from the session-scoped `useSession` snapshot):
		*   - chat.order + chat.nodes.get(key) -> user-message nodes
		*   - node.data.content (ContentBlock[]) -> message text
		*
		* Jump: the harness renders every chat row with a `data-chat-anchor-key`
		* attribute whose value is the node key; `scrollIntoView` lands on it.
		*/
		/**
		* Find a chat row by its node key, avoiding CSS.escape pitfalls on keys that
		* contain `<`/`>`/`:` (the node key is `13:input-message<messageId>`).
		*/
		function findRow(key) {
			for (const row of document.querySelectorAll("[data-chat-anchor-key]")) if (row.dataset.chatAnchorKey === key) return row;
			return null;
		}
		/**
		* Absolute time label from an epoch-ms timestamp: today's messages show
		* `HH:MM`; anything earlier (yesterday and before) shows `MM/DD HH:MM`.
		*/
		function formatTime(ms) {
			const date = new Date(ms);
			const now = /* @__PURE__ */ new Date();
			const hh = String(date.getHours()).padStart(2, "0");
			const mm = String(date.getMinutes()).padStart(2, "0");
			if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()) return `${hh}:${mm}`;
			return `${date.getMonth() + 1}/${date.getDate()} ${hh}:${mm}`;
		}
		/**
		* Rail container: fixed at the frame's right edge, vertically centred.
		* Click-through: only the dot list below opts back into pointer events.
		* Height-capped so a long conversation cannot overflow the viewport — the
		* dot list inside scrolls instead (dots keep their spacing, never compress).
		*/
		const railStyle = {
			position: "fixed",
			right: 8,
			top: "50%",
			transform: "translateY(-50%)",
			display: "flex",
			flexDirection: "column",
			maxHeight: "70vh",
			zIndex: 1e3,
			pointerEvents: "none"
		};
		/** Dot list: scrolls internally once it outgrows the rail's height cap. */
		const listStyle = {
			flex: 1,
			minHeight: 0,
			overflowY: "auto",
			scrollbarWidth: "none",
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			gap: 10,
			padding: "10px 4px",
			pointerEvents: "auto"
		};
		/** Hover tooltip: floats to the left of its dot. */
		function tooltipStyle(open) {
			return {
				position: "absolute",
				right: "calc(100% + 12px)",
				top: "50%",
				transform: "translateY(-50%)",
				textAlign: "left",
				width: "max-content",
				maxWidth: 260,
				whiteSpace: "normal",
				wordBreak: "break-word",
				background: "#ffffff",
				color: "#1f2430",
				border: "1px solid rgba(15, 23, 42, 0.12)",
				borderRadius: 8,
				padding: "8px 10px",
				fontSize: 12,
				lineHeight: 1.5,
				boxShadow: "0 4px 16px rgba(0, 0, 0, 0.18)",
				pointerEvents: "none",
				opacity: open ? 1 : 0,
				transition: "opacity 120ms ease"
			};
		}
		/**
		* @param props - the session-scoped standard kit from the framework, plus the
		*   injected `loadOlder` action (no-op default for renders outside the slot
		*   machinery).
		*/
		function TimelineRail({ useSession, loadOlder = async () => {} }) {
			const order = useSession((s) => s.chat.order);
			const nodes = useSession((s) => s.chat.nodes);
			const hasMore = useSession((s) => s.hasMore);
			const loadingOlder = useSession((s) => s.loadingOlder);
			const [hoveredKey, setHoveredKey] = (0, react.useState)(null);
			const listRef = (0, react.useRef)(null);
			const marks = (0, react.useMemo)(() => {
				const result = [];
				for (const key of order) {
					const node = nodes.get(key);
					if (node === void 0 || node.kind !== "user") continue;
					const data = node.data;
					result.push({
						key,
						seq: data.seq ?? 0,
						time: data.time ?? 0,
						preview: extractPreview(data.content)
					});
				}
				return result;
			}, [order, nodes]);
			(0, react.useEffect)(() => {
				if (hasMore && !loadingOlder) loadOlder();
			}, [
				hasMore,
				loadingOlder,
				loadOlder,
				order
			]);
			(0, react.useEffect)(() => {
				const el = listRef.current;
				if (el !== null && hasMore) el.scrollTop = el.scrollHeight;
			}, [marks.length, hasMore]);
			if (marks.length === 0) return null;
			/** Jump to the chat row with the given node key. */
			const jump = (key) => {
				const row = findRow(key);
				if (row === null) return;
				row.scrollIntoView({
					behavior: "smooth",
					block: "start"
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: railStyle,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					ref: listRef,
					style: listStyle,
					role: "navigation",
					"aria-label": "提问时间线",
					children: marks.map((mark, i) => {
						const open = hoveredKey === mark.key;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-label": mark.preview ? `第 ${i + 1} 条提问：${mark.preview}` : `第 ${i + 1} 条提问`,
							onClick: () => jump(mark.key),
							onMouseEnter: () => setHoveredKey(mark.key),
							onMouseLeave: () => setHoveredKey(null),
							style: {
								position: "relative",
								pointerEvents: "auto",
								width: 10,
								height: 10,
								borderRadius: "50%",
								border: "none",
								padding: 0,
								cursor: "pointer",
								background: dotColor(i, marks.length),
								boxShadow: open ? "0 0 0 3px rgba(218, 228, 255, 0.55)" : "none",
								transform: open ? "scale(1.35)" : "scale(1)",
								transition: "transform 120ms ease, box-shadow 120ms ease"
							},
							onMouseDown: (e) => e.stopPropagation(),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: tooltipStyle(open),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "block",
										fontSize: 11,
										color: "#6b7280",
										marginBottom: 4
									},
									children: [
										"第 ",
										i + 1,
										" 条提问 · ",
										formatTime(mark.time)
									]
								}), mark.preview.length > 0 ? mark.preview + (mark.preview.length >= 80 ? "…" : "") : "（空消息）"]
							})
						}, mark.key);
					})
				})
			});
		}
		//#endregion
		//#region src/client/railInject.ts
		/**
		* Wrap a session-bound `loadOlder` call into a safe action closure.
		*
		* - Missing binding: resolves (never throws on an unlisted/unscoped session).
		* - Bound session: delegates to `session.loadOlder()`; a rejection propagates
		*   unchanged so callers can surface the transport error.
		*
		* @param sessions - the injected sessions service (`ctx.sessions`).
		* @param sessionId - the session the rail is scoped to.
		* @returns an action that loads the previous message page for that session.
		*/
		function createLoadOlder(sessions, sessionId) {
			return async () => {
				const binding = sessions.binding(sessionId);
				if (binding === void 0) return;
				await binding.session.loadOlder();
			};
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services (cordis fiber inject). */
		const inject = ["slots", "sessions"];
		/**
		* Register the overlay and rail once their slot declarations are on the
		* ledger. The overlay registers directly against the shipped shell.overlay
		* declaration; the rail registers against our own child declaration, which
		* appears exactly when the overlay entry mounts.
		*/
		function apply(ctx) {
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "timeline",
				order: 100,
				children: { "timeline.rail": {
					kind: "single",
					scope: "session"
				} }
			}, TimelineOverlay));
			ctx.slots.inject("timeline.rail", () => ctx.slots.register({
				name: "timeline.rail",
				inject: (sessionId) => ({ loadOlder: createLoadOlder(ctx.sessions, sessionId) })
			}, TimelineRail));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map