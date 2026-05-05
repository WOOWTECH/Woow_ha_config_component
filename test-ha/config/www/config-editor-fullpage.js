console.info("Config Editor Fullpage 1.0.0");

const LitElement = window.LitElement || Object.getPrototypeOf(customElements.get("hui-masonry-view"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class ConfigEditorFullpage extends LitElement {

static get properties() {
	return {
		_hass: {type: Object},
		code: {type: String},
		fileList: {type: Array},
		openedFile: {type: String},
		infoLine: {type: String},
		alertLine: {type: String},
		edit: {},
	};
}

constructor() {
	super();
	this.code = '';
	this.fileList = [];
	this.openedFile = '';
	this.infoLine = '';
	this.alertLine = '';
}

static get styles() {
	return css`
	:host {
		display: flex;
		flex-direction: column;
		height: calc(100vh - var(--header-height, 56px));
		overflow: hidden;
		background: var(--primary-background-color, #fff);
		color: var(--primary-text-color, #212121);
		font-family: var(--paper-font-body1_-_font-family, 'Roboto', sans-serif);
	}

	/* Toolbar */
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: var(--secondary-background-color, #f5f5f5);
		border-bottom: 1px solid var(--divider-color, #e0e0e0);
		z-index: 3;
		flex-shrink: 0;
	}

	.toolbar-group {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.toolbar-spacer {
		flex: 1;
		min-width: 8px;
	}

	.file-select {
		flex: 1;
		min-width: 150px;
		max-width: 100%;
		text-overflow: ellipsis;
		overflow: hidden;
		padding: 4px 6px;
		border-radius: 4px;
		border: 1px solid var(--divider-color, #ccc);
		background: var(--card-background-color, #fff);
		color: var(--primary-text-color, #212121);
		font-size: 13px;
	}

	.ext-select {
		padding: 4px 6px;
		border-radius: 4px;
		border: 1px solid var(--divider-color, #ccc);
		background: var(--card-background-color, #fff);
		color: var(--primary-text-color, #212121);
		font-size: 13px;
	}

	button {
		cursor: pointer;
		padding: 4px 10px;
		border: none;
		border-radius: 4px;
		background: var(--primary-color, #03a9f4);
		color: var(--text-primary-color, #fff);
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		transition: opacity 0.2s;
	}
	button:hover { opacity: 0.85; }
	button:active { opacity: 0.7; }

	button.secondary {
		background: var(--secondary-background-color, #e0e0e0);
		color: var(--primary-text-color, #212121);
		border: 1px solid var(--divider-color, #ccc);
	}

	button.size-btn {
		padding: 4px 8px;
		font-family: Times, serif;
		font-weight: bold;
		min-width: 28px;
	}

	label {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		cursor: pointer;
		color: var(--secondary-text-color, #666);
	}

	/* Editor area */
	.editor {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		position: relative;
	}

	.editor ha-code-editor {
		display: block;
		height: 100%;
		--code-mirror-height: 100%;
	}

	.editor textarea {
		display: block;
		width: 100%;
		height: 100%;
		padding: 12px;
		margin: 0;
		border: none;
		outline: none;
		resize: none;
		overflow: auto;
		white-space: pre;
		overflow-wrap: normal;
		font-family: 'Fira Code', 'Courier New', monospace;
		font-size: inherit;
		background: var(--primary-background-color, #fff);
		color: var(--primary-text-color, #212121);
		box-sizing: border-box;
	}

	/* Status bar */
	.status {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 12px;
		background: var(--app-header-background-color, #455a64);
		color: var(--app-header-text-color, #fff);
		font-size: 12px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex-shrink: 0;
		z-index: 3;
	}

	.status .alert {
		background: #ff7a81;
		padding: 2px 6px;
		border-radius: 3px;
		cursor: pointer;
		color: #fff;
		font-weight: 500;
	}

	.status code {
		opacity: 0.8;
		margin-left: auto;
	}

	/* Message */
	.msg {
		padding: 12px;
		color: var(--error-color, #db4437);
	}
	.msg a {
		color: var(--primary-color, #03a9f4);
	}

	/* RWD */
	@media (max-width: 767px) {
		.toolbar {
			padding: 4px 8px;
			gap: 4px;
		}
		.file-select {
			order: 10;
			min-width: 100%;
		}
		button { padding: 4px 8px; font-size: 12px; }
		button.size-btn { min-width: 24px; padding: 3px 6px; }
	}
	`;
}

render() {
	const targetver = 5;

	if (!this._hass) { return html``; }

	if (this.fileList.length < 1) {
		this.openedFile = this.localGet('Open') || '';
		this.edit.ext = this.localGet('Ext') || 'yaml';
		this.edit.basic = this.localGet('Basic') || '';
		const cached = this.localGet('List' + this.edit.ext);
		if (cached) {
			this.fileList = JSON.parse(cached);
			if (this.extOk(this.openedFile)) {
				setTimeout(this.oldText, 500, this);
			}
		} else {
			this.List();
		}
	}

	const hver = this.edit.cver;
	const dlink = html`<a href="https://github.com/junkfix/config-editor">download</a>`;

	return html`
		${(!this._hass.config.components.includes("config_editor"))
			? html`<div class="msg">Missing 'config_editor:' in configuration.yaml — ${dlink}</div>` : ''}
		${(hver && hver != targetver)
			? html`<div class="msg">Please ${dlink} upgrade backend from v${hver} to v${targetver}</div>` : ''}

		<div class="toolbar">
			<div class="toolbar-group">
				${!this.edit.readonly ? html`<button @click="${this.Save}">Save</button>` : ''}
				<button class="secondary" @click="${this.reLoad}">Reload</button>
			</div>

			<select class="file-select" @change=${this.Load}>
				${[''].concat(this.fileList).map(value =>
					html`<option ?selected=${value === this.openedFile} value=${value}>${value || '— Select file —'}</option>`
				)}
			</select>

			<div class="toolbar-group">
				<button class="secondary" @click="${this.List}">List</button>
			</div>

			<div class="toolbar-spacer"></div>

			<div class="toolbar-group">
				<select class="ext-select" @change=${this.extChange}>
					${["yaml","py","json","conf","js","txt","log","jinja","all"].map(value =>
						html`<option ?selected=${value === this.edit.ext} value=${value}>${value.toUpperCase()}</option>`
					)}
				</select>
				<button class="secondary size-btn" @click="${e => this.txtSize(0)}">−</button>
				<button class="secondary size-btn" @click="${e => this.txtSize(2)}">A</button>
				<button class="secondary size-btn" @click="${e => this.txtSize(1)}">+</button>
				<label><input type="checkbox" ?checked=${this.edit.basic == '1'}
					@change=${this.basicChange}>Basic</label>
			</div>
		</div>

		<div class="editor">
			${(this.edit.basic || this.edit.coder)
				? html`<textarea ?readonly=${!0 == this.edit.readonly}
					@change=${this.updateText} id="code" @keydown=${this.saveKey}>${this.code}</textarea>`
				: html`<ha-code-editor id="code" mode="yaml"
					?readOnly=${!0 == this.edit.readonly}
					@keydown=${this.saveKey} .hass=${this._hass}
					@value-changed=${this.updateText}
					dir="ltr" autocomplete-entities autocomplete-icons></ha-code-editor>`
			}
		</div>

		<div class="status">
			${this.alertLine ? html`<span class="alert">${this.alertLine}</span>` : ''}
			<code>${this.infoLine}</code>
		</div>
	`;
}

txtSize(e) {
	if (e < 3) {
		if (e > 1) {
			this.edit.size = 100;
		} else if (e > 0) {
			this.edit.size = Math.min(this.edit.size + 5, 300);
		} else {
			this.edit.size = Math.max(this.edit.size - 5, 30);
		}
		this.localSet('Size', this.edit.size);
		this.infoLine = 'size: ' + this.edit.size;
	}
	this.renderRoot.querySelector('#code').style.fontSize = this.edit.size + '%';
}

extChange(e) {
	this.edit.ext = e.target.value;
	this.localSet('Ext', this.edit.ext);
	this.openedFile = '';
	this.oldText(this);
	this.List();
}

basicChange() {
	this.edit.basic = this.edit.basic ? '' : '1';
	this.localSet('Basic', this.edit.basic);
	this.reLoad();
}

updateText(e) {
	e.stopPropagation();
	this.code = this.edit.basic ? e.target.value : e.detail.value;
	if (this.openedFile) { this.localSet('Text', this.code); }
}

Unsave() {
	this.code = this.localGet('Unsaved');
	this.renderRoot.querySelector('#code').value = this.code;
	this.localSet('Unsaved', '');
	this.alertLine = '';
	this.Toast("Loaded from browser", 1500);
}

localGet(e) {
	return localStorage.getItem('config_editor_fp_' + e);
}

localSet(k, v) {
	localStorage.setItem('config_editor_fp_' + k, v);
}

cmd(action, data, file) {
	return this._hass.callWS({
		type: "config_editor/ws",
		action: action,
		data: data,
		file: file,
		ext: this.edit.ext,
		depth: this.edit.depth
	});
}

saveList() {
	this.localSet('List' + this.edit.ext, JSON.stringify(this.fileList));
}

reLoad() {
	this.Load({target: {value: this.openedFile}, reload: 1});
}

oldText(dhis) {
	dhis.Load({target: {value: dhis.openedFile}});
}

saveKey(e) {
	if ((e.key == 'S' || e.key == 's') && (e.ctrlKey || e.metaKey)) {
		e.preventDefault();
		this.Save();
		return false;
	}
	return true;
}

Toast(message, duration) {
	const e = new Event("hass-notification",
		{bubbles: true, cancelable: false, composed: true});
	e.detail = {message, duration, dismissable: true};
	document.querySelector("home-assistant").dispatchEvent(e);
}

async Coder() {
	const c = "ha-yaml-editor";
	if (!customElements.get(c)) {
		await customElements.whenDefined("partial-panel-resolver");
		const p = document.createElement('partial-panel-resolver');
		p.hass = {panels: [{url_path: "tmp", component_name: "config"}]};
		p._updateRoutes();
		await p.routerOptions.routes.tmp.load();
		const d = document.createElement("ha-panel-config");
		await d.routerOptions.routes.automation.load();
	}
	const a = document.createElement(c);
	this.edit.coder = 0;
	if (!a) {
		this.localSet('Basic', 1);
		console.error('failed ' + c);
	}
	this.render();
}

async List() {
	this.infoLine = 'List loading...';
	const e = await this.cmd('list', '', '');
	if (e) {
		this.edit.cver = e.cver;
		this.infoLine = e.msg;
		this.fileList = e.file.slice().sort();
		this.saveList();
		if (this.extOk(this.openedFile)) {
			setTimeout(this.oldText, 500, this);
		}
	}
}

async Load(x) {
	if (x.target.value == this.openedFile && this.code && !x.hasOwnProperty('reload')) { return; }
	if (this.edit.orgCode.trim() != this.code.trim()) {
		if (!confirm("Switch without Saving?")) { x.target.value = this.openedFile; return; }
	}
	this.code = '';
	this.renderRoot.querySelector('#code').value = '';
	this.infoLine = '';
	this.openedFile = x.target.value;
	if (this.openedFile) {
		this.infoLine = 'Loading: ' + this.openedFile;
		const e = await this.cmd('load', '', this.openedFile);
		if (e) {
			this.edit.cver = e.cver;
			this.openedFile = e.file;
			this.infoLine = e.msg;
			this.Toast(this.infoLine, 1000);
			const uns = {
				f: this.localGet('Open'),
				d: this.localGet('Text')
			};
			if (uns.f == this.openedFile && uns.d && uns.d != e.data) {
				this.localSet('Unsaved', uns.d);
				this.alertLine = html`<span @click="${this.Unsave}">Load unsaved from browser</span>`;
			} else {
				this.localSet('Text', '');
				this.alertLine = '';
			}
			this.renderRoot.querySelector('#code').value = e.data;
			this.code = e.data;
		}
	}
	this.edit.orgCode = this.code;
	this.localSet('Open', this.openedFile);
	this.txtSize(3);
}

extOk(f) {
	if (f.length && (this.edit.ext == 'all' || f.endsWith("." + this.edit.ext))) { return 1; }
	return 0;
}

async Save() {
	if (this.renderRoot.querySelector('#code').value != this.code || this.edit.readonly) {
		this.infoLine = 'Something not right!';
		return;
	}
	let savenew = 0;
	if (!this.openedFile && this.code) {
		this.openedFile = prompt("type abc." + this.edit.ext + " or folder/abc." + this.edit.ext);
		savenew = 1;
	}
	if (this.extOk(this.openedFile)) {
		if (!confirm("Save?")) { if (savenew) { this.openedFile = ''; } return; }
		if (!this.code) { this.infoLine = ''; this.infoLine = 'Text is empty!'; return; }
		this.infoLine = 'Saving: ' + this.openedFile;
		const e = await this.cmd('save', this.code, this.openedFile);
		if (e) {
			this.infoLine = e.msg;
			this.Toast(this.infoLine, 2000);
			if (e.msg.includes('Saved:')) {
				this.localSet('Text', '');
				if (savenew) {
					this.fileList.unshift(this.openedFile);
					this.saveList();
				}
			}
		}
	} else {
		this.openedFile = '';
	}
	this.edit.orgCode = this.code;
}

getCardSize() {
	return 100;
}

setConfig(config) {
	this.edit = {
		file: '', hidefooter: false, readonly: false,
		basic: false, size: 0, depth: 2, ext: '',
		orgCode: '', coder: 1, cver: 0,
		...config
	};
	if (this.edit.file) {
		const f = this.edit.file.split('.')[1];
		if (f) {
			this.localSet('Open', this.edit.file);
			this.localSet('Ext', f);
		}
	}
	if (!this.edit.size) {
		this.edit.size = Number(this.localGet('Size')) || 100;
	}
	this.Coder();
}

set hass(hass) {
	this._hass = hass;
}

shouldUpdate(changedProps) {
	for (const e of ['code', 'openedFile', 'fileList', 'infoLine', 'alertLine', 'edit']) {
		if (changedProps.has(e)) { return true; }
	}
}

}

customElements.define('config-editor-fullpage', ConfigEditorFullpage);

window.customCards = window.customCards || [];
window.customCards.push({
	type: 'config-editor-fullpage',
	name: 'Config Editor Fullpage',
	preview: false,
	description: 'Full-page immersive YAML editor for Home Assistant'
});
