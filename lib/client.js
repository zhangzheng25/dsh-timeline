window.__ModuleLoader__.load({
	id: "dsh-timeline",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let react_dom = require("react-dom");
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
		//#endregion
		//#region src/client/useCurrentAnchor.ts
		/**
		* useCurrentAnchor: tracks which user-question "segment" the conversation
		* viewport's BOTTOM edge currently sits in, so the rail can light the
		* corresponding dot.
		*
		* A segment is one question plus everything after it (its AI answer) up to
		* the next question — the viewport bottom stays inside the last segment
		* while scrolling until that whole question+answer has scrolled past, then
		* the highlight moves up to the previous question. At the bottom of a
		* conversation the newest question's dot is lit by default.
		*
		* Resolves the harness DOM shape (`[data-conversation-scroll]` containing
		* `[data-chat-anchor-key]` rows), filters to the user rows (the passed
		* marks' keys), and picks the LAST user row whose top is still at/above the
		* scrollport's bottom edge. Recomputes on scrollport `scroll` events; when
		* `IntersectionObserver` exists the user rows are also observed (root =
		* scrollport, threshold 0) so layout changes that move a row across the
		* bottom edge without a scroll event still refresh.
		*
		* Pure observation: no timers, no polling; geometry is read only on events.
		*
		* @param order - the ordered chat node keys; a change re-resolves the DOM
		*   rows (new messages appended, load-older prepends, ...).
		* @param marks - the user-question marks; their keys select the user rows.
		* @returns the anchor key of the question whose segment the viewport bottom
		*   is in, or undefined when no user row has reached the bottom edge yet.
		*/
		function useCurrentAnchor(order, marks) {
			const [current, setCurrent] = (0, react.useState)(void 0);
			(0, react.useEffect)(() => {
				const scrollport = document.querySelector("[data-conversation-scroll]");
				if (scrollport === null) {
					setCurrent(void 0);
					return;
				}
				const userKeys = new Set(marks.map((m) => m.key));
				const rows = [...scrollport.querySelectorAll("[data-chat-anchor-key]")].filter((row) => userKeys.has(row.dataset.chatAnchorKey ?? ""));
				const compute = () => {
					const bottom = scrollport.getBoundingClientRect().bottom;
					let found;
					for (const row of rows) if (row.getBoundingClientRect().top <= bottom) found = row.dataset.chatAnchorKey ?? void 0;
					else break;
					setCurrent(found);
				};
				compute();
				scrollport.addEventListener("scroll", compute, { passive: true });
				if (typeof IntersectionObserver !== "undefined") {
					const observer = new IntersectionObserver(compute, {
						root: scrollport,
						threshold: [0]
					});
					for (const row of rows) observer.observe(row);
					return () => {
						observer.disconnect();
						scrollport.removeEventListener("scroll", compute);
					};
				}
				return () => {
					scrollport.removeEventListener("scroll", compute);
				};
			}, [order, marks]);
			return current;
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
		/** Dot geometry: 10px dots with roomy 16px gaps. */
		const DOT_SIZE = 10;
		const DOT_GAP = 16;
		/**
		* Dot colors: plain dots are quiet gray; the highlighted dot (hovered or
		* current segment) turns blue. Deliberately NO scale/ring on highlight — an
		* enlarged dot was the reason edge dots got clipped, so state is carried by
		* color alone and the 10px circle can never touch the list's edges.
		*/
		const DOT_COLOR = "#B8BEC9";
		const DOT_HIGHLIGHT = "#4D75E6";
		/**
		* Breathing room above the first and below the last dot. Must be a MARGIN on
		* the edge dots, not container padding: padding scrolls out of view at the
		* extremes, margin lives in the scroll content and stays visible, so the
		* first/last dots are never clipped by the list's edge.
		*/
		const EDGE_GAP = 16;
		/**
		* Clearance the follow-scroll keeps between the lit dot and the list edges.
		* Small on purpose: the dot never grows (no ring/scale), so it only needs to
		* stay fully inside the list — generous bands just push neighbours around.
		*/
		const KEEP_IN_VIEW_PX = 16;
		/**
		* Rail container: fixed at the frame's right edge, vertically centred.
		* Click-through: only the dot list below opts back into pointer events.
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
		/** Dot list: fixed height of MAX_VISIBLE_DOTS dots; older ones scroll inside. */
		const listStyle = {
			minHeight: 0,
			height: 406,
			overflowY: "auto",
			scrollbarWidth: "none",
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			gap: DOT_GAP,
			padding: "0 4px",
			pointerEvents: "auto"
		};
		/**
		* Hover tooltip, portalled onto `document.body` with `position: fixed`.
		*
		* It must NOT live inside the dot list: an `overflow-y: auto` container forces
		* `overflow-x` to auto as well (CSS can't keep one axis visible while the
		* other scrolls), which would clip the tooltip as it pops out to the left.
		* Portalling escapes every ancestor's clipping; `translate(-100%, -50%)`
		* anchors the box to the dot without knowing its width up front.
		*/
		function tooltipStyle(pos) {
			return {
				position: "fixed",
				left: pos.x - 12,
				top: pos.y,
				transform: "translate(-100%, -50%)",
				zIndex: 2e3,
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
				pointerEvents: "none"
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
			const [hovered, setHovered] = (0, react.useState)(null);
			const listRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const style = document.createElement("style");
				style.textContent = ["[data-timeline-list]{scrollbar-width:none}[data-timeline-list]::-webkit-scrollbar{display:none;width:0;height:0}", "[data-conversation-scroll]{scrollbar-width:none}[data-conversation-scroll]::-webkit-scrollbar{display:none;width:0;height:0}"].join("");
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, []);
			const marks = (0, react.useMemo)(() => {
				const result = [];
				for (const key of order) {
					const node = nodes.get(key);
					if (node === void 0 || node.kind !== "user") continue;
					const data = node.data;
					result.push({
						key,
						time: data.time ?? 0,
						preview: extractPreview(data.content)
					});
				}
				return result;
			}, [order, nodes]);
			const currentKey = useCurrentAnchor(order, marks);
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
			(0, react.useEffect)(() => {
				if (currentKey === void 0) return;
				const el = listRef.current;
				if (el === null) return;
				let dot = null;
				for (const row of el.querySelectorAll("[data-dot-key]")) if (row.dataset.dotKey === currentKey) {
					dot = row;
					break;
				}
				if (dot === null) return;
				const elRect = el.getBoundingClientRect();
				const relTop = dot.getBoundingClientRect().top - elRect.top + el.scrollTop;
				const relBottom = relTop + DOT_SIZE;
				const bandTop = el.scrollTop + KEEP_IN_VIEW_PX;
				const bandBottom = el.scrollTop + el.clientHeight - KEEP_IN_VIEW_PX;
				let target = null;
				if (relTop < bandTop) target = el.scrollTop - (bandTop - relTop);
				else if (relBottom > bandBottom) target = el.scrollTop + (relBottom - bandBottom);
				if (target !== null) el.scrollTop = Math.max(0, Math.min(target, el.scrollHeight - el.clientHeight));
			}, [currentKey]);
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
			const hoveredIndex = hovered === null ? -1 : marks.findIndex((m) => m.key === hovered.key);
			const hoveredMark = hoveredIndex >= 0 ? marks[hoveredIndex] : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: railStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					ref: listRef,
					"data-timeline-list": true,
					style: listStyle,
					role: "navigation",
					"aria-label": "提问时间线",
					children: marks.map((mark, i) => {
						const isHovered = hovered?.key === mark.key;
						const isCurrent = !isHovered && currentKey === mark.key;
						const lit = isHovered || isCurrent;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"data-dot-key": mark.key,
							"aria-label": mark.preview ? `第 ${i + 1} 条提问：${mark.preview}` : `第 ${i + 1} 条提问`,
							onClick: () => jump(mark.key),
							onMouseEnter: (e) => {
								const rect = e.currentTarget.getBoundingClientRect();
								setHovered({
									key: mark.key,
									x: rect.left,
									y: rect.top + rect.height / 2
								});
							},
							onMouseLeave: () => setHovered(null),
							onMouseDown: (e) => e.stopPropagation(),
							style: {
								position: "relative",
								pointerEvents: "auto",
								marginTop: i === 0 ? EDGE_GAP : 0,
								marginBottom: i === marks.length - 1 ? EDGE_GAP : 0,
								width: DOT_SIZE,
								height: DOT_SIZE,
								borderRadius: "50%",
								flexShrink: 0,
								border: "none",
								padding: 0,
								cursor: "pointer",
								background: lit ? DOT_HIGHLIGHT : DOT_COLOR
							}
						}, mark.key);
					})
				}), hovered !== null && hoveredMark !== void 0 && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					style: tooltipStyle(hovered),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "block",
							fontSize: 11,
							color: "#6b7280",
							marginBottom: 4
						},
						children: [
							"第 ",
							hoveredIndex + 1,
							" 条提问 · ",
							formatTime(hoveredMark.time)
						]
					}), hoveredMark.preview.length > 0 ? hoveredMark.preview + (hoveredMark.preview.length >= 80 ? "…" : "") : "（空消息）"]
				}), document.body)]
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