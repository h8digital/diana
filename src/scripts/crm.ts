interface Stage {
	id: number;
	name: string;
	position: number;
}

interface Lead {
	id: number;
	name: string;
	phone: string;
	objective: string | null;
	stage_id: number;
	notes: string | null;
	page_url: string | null;
	created_at: string;
	updated_at: string;
}

let stages: Stage[] = [];
let leads: Lead[] = [];
let currentLeadId: number | null = null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function formatDate(iso: string): string {
	try {
		return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
		});
	} catch {
		return iso;
	}
}

function whatsappLink(phone: string): string {
	const digits = phone.replace(/\D/g, '');
	const full = digits.startsWith('55') ? digits : `55${digits}`;
	return `https://api.whatsapp.com/send?phone=${full}`;
}

async function api<T = any>(path: string, options: RequestInit = {}): Promise<{ status: number; data: T }> {
	const res = await fetch(path, {
		...options,
		headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
	});
	const data = await res.json().catch(() => ({}));
	return { status: res.status, data };
}

// ---------- auth ----------

async function checkSession(): Promise<boolean> {
	const { status, data } = await api('/api/crm/me');
	if (status === 200) {
		$('crm-username').textContent = data.username || '';
		$('crm-user-bar').classList.remove('hidden');
		$('crm-user-bar').classList.add('flex');
		return true;
	}
	return false;
}

function showLogin(): void {
	$('crm-login-view').classList.remove('hidden');
	$('crm-board-view').classList.add('hidden');
	$('crm-user-bar').classList.add('hidden');
}

function showBoard(): void {
	$('crm-login-view').classList.add('hidden');
	$('crm-board-view').classList.remove('hidden');
}

async function handleLoginSubmit(event: SubmitEvent): Promise<void> {
	event.preventDefault();
	const username = $<HTMLInputElement>('crm-username-input').value;
	const password = $<HTMLInputElement>('crm-password-input').value;
	const errorEl = $('crm-login-error');
	errorEl.classList.add('hidden');

	const { status } = await api('/api/crm/login', { method: 'POST', body: JSON.stringify({ username, password }) });
	if (status !== 200) {
		errorEl.textContent = 'Usuário ou senha incorretos.';
		errorEl.classList.remove('hidden');
		return;
	}
	await bootBoard();
}

async function handleLogout(): Promise<void> {
	await api('/api/crm/logout', { method: 'POST' });
	showLogin();
}

// ---------- board rendering ----------

async function loadData(): Promise<void> {
	const [stagesRes, leadsRes] = await Promise.all([api('/api/crm/stages'), api('/api/crm/leads')]);
	stages = (stagesRes.data.stages || []).sort((a: Stage, b: Stage) => a.position - b.position);
	leads = leadsRes.data.leads || [];
}

function leadsForStage(stageId: number): Lead[] {
	return leads.filter((l) => l.stage_id === stageId);
}

function renderBoard(): void {
	const board = $('crm-board');
	board.innerHTML = '';

	for (const stage of stages) {
		const column = document.createElement('div');
		column.className = 'flex w-72 shrink-0 flex-col rounded-2xl bg-white/70 border border-navy/10 shadow-sm';
		column.dataset.stageId = String(stage.id);

		const stageLeads = leadsForStage(stage.id);

		const header = document.createElement('div');
		header.className = 'flex items-center justify-between gap-2 border-b border-navy/10 px-4 py-3';
		header.innerHTML = `
			<span class="stage-name font-bold text-navy text-sm cursor-pointer" title="Clique para renomear">${escapeHtml(stage.name)}</span>
			<div class="flex items-center gap-2">
				<span class="rounded-full bg-navy/5 px-2 py-0.5 text-xs font-semibold text-navy-soft">${stageLeads.length}</span>
				<button class="stage-delete text-navy-soft hover:text-red-600 text-xs" title="Excluir etapa">✕</button>
			</div>
		`;
		header.querySelector('.stage-name')?.addEventListener('click', () => renameStage(stage));
		header.querySelector('.stage-delete')?.addEventListener('click', () => deleteStage(stage));

		const list = document.createElement('div');
		list.className = 'flex-1 space-y-2 p-3 min-h-[80px]';
		list.addEventListener('dragover', (e) => {
			e.preventDefault();
			list.classList.add('bg-gold/10');
		});
		list.addEventListener('dragleave', () => list.classList.remove('bg-gold/10'));
		list.addEventListener('drop', async (e) => {
			e.preventDefault();
			list.classList.remove('bg-gold/10');
			const leadId = Number(e.dataTransfer?.getData('text/lead-id'));
			if (!leadId) return;
			await moveLead(leadId, stage.id);
		});

		for (const lead of stageLeads) {
			list.appendChild(renderCard(lead));
		}

		column.appendChild(header);
		column.appendChild(list);
		board.appendChild(column);
	}
}

function escapeHtml(str: string): string {
	const div = document.createElement('div');
	div.textContent = str;
	return div.innerHTML;
}

function renderCard(lead: Lead): HTMLElement {
	const card = document.createElement('div');
	card.className = 'cursor-grab rounded-xl border border-navy/10 bg-white p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing';
	card.draggable = true;
	card.dataset.leadId = String(lead.id);
	card.innerHTML = `
		<p class="text-sm font-semibold text-navy">${escapeHtml(lead.name)}</p>
		<p class="mt-1 text-xs text-navy-soft">${escapeHtml(lead.phone)}</p>
		${lead.objective ? `<span class="mt-2 inline-block rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold-deep">${escapeHtml(lead.objective)}</span>` : ''}
		<p class="mt-2 text-[11px] text-navy-soft/70">${formatDate(lead.created_at)}</p>
	`;
	card.addEventListener('dragstart', (e) => {
		e.dataTransfer?.setData('text/lead-id', String(lead.id));
		card.classList.add('opacity-40');
	});
	card.addEventListener('dragend', () => card.classList.remove('opacity-40'));
	card.addEventListener('click', () => openLeadModal(lead));
	return card;
}

async function moveLead(leadId: number, stageId: number): Promise<void> {
	const lead = leads.find((l) => l.id === leadId);
	if (!lead || lead.stage_id === stageId) return;
	const previousStage = lead.stage_id;
	lead.stage_id = stageId;
	renderBoard();

	const { status } = await api(`/api/crm/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ stage_id: stageId }) });
	if (status !== 200) {
		lead.stage_id = previousStage;
		renderBoard();
	}
}

// ---------- stage management ----------

async function addStage(): Promise<void> {
	const name = window.prompt('Nome da nova etapa:');
	if (!name || !name.trim()) return;
	const { status } = await api('/api/crm/stages', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
	if (status === 200) {
		await loadData();
		renderBoard();
	}
}

async function renameStage(stage: Stage): Promise<void> {
	const name = window.prompt('Novo nome da etapa:', stage.name);
	if (!name || !name.trim() || name.trim() === stage.name) return;
	const { status } = await api(`/api/crm/stages/${stage.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
	if (status === 200) {
		await loadData();
		renderBoard();
	}
}

async function deleteStage(stage: Stage): Promise<void> {
	if (!window.confirm(`Excluir a etapa "${stage.name}"? Só é possível se não houver leads nela.`)) return;
	const { status, data } = await api(`/api/crm/stages/${stage.id}`, { method: 'DELETE' });
	if (status === 200) {
		await loadData();
		renderBoard();
	} else if (data?.error === 'stage_not_empty') {
		window.alert('Essa etapa ainda tem leads. Mova-os antes de excluir.');
	} else if (data?.error === 'last_stage') {
		window.alert('Não é possível excluir a última etapa.');
	}
}

// ---------- lead modal ----------

function openLeadModal(lead: Lead): void {
	currentLeadId = lead.id;
	$('crm-modal-name').textContent = lead.name;
	$('crm-modal-phone').textContent = lead.phone;
	$('crm-modal-meta').textContent = `Objetivo: ${lead.objective || '—'} · Recebido em ${formatDate(lead.created_at)}`;
	$<HTMLAnchorElement>('crm-modal-whatsapp').href = whatsappLink(lead.phone);
	$<HTMLTextAreaElement>('crm-modal-notes').value = lead.notes || '';
	$('crm-lead-modal').classList.remove('hidden');
	$('crm-lead-modal').classList.add('flex');
}

function closeLeadModal(): void {
	currentLeadId = null;
	$('crm-lead-modal').classList.add('hidden');
	$('crm-lead-modal').classList.remove('flex');
}

async function saveLeadNotes(): Promise<void> {
	if (currentLeadId === null) return;
	const notes = $<HTMLTextAreaElement>('crm-modal-notes').value;
	const { status } = await api(`/api/crm/leads/${currentLeadId}`, { method: 'PATCH', body: JSON.stringify({ notes }) });
	if (status === 200) {
		const lead = leads.find((l) => l.id === currentLeadId);
		if (lead) lead.notes = notes;
		closeLeadModal();
	}
}

async function deleteLead(): Promise<void> {
	if (currentLeadId === null) return;
	if (!window.confirm('Excluir este lead permanentemente?')) return;
	const { status } = await api(`/api/crm/leads/${currentLeadId}`, { method: 'DELETE' });
	if (status === 200) {
		leads = leads.filter((l) => l.id !== currentLeadId);
		closeLeadModal();
		renderBoard();
	}
}

// ---------- boot ----------

async function bootBoard(): Promise<void> {
	showBoard();
	await loadData();
	renderBoard();
}

async function init(): Promise<void> {
	$('crm-login-form').addEventListener('submit', handleLoginSubmit);
	$('crm-logout').addEventListener('click', handleLogout);
	$('crm-add-stage').addEventListener('click', addStage);
	$('crm-modal-close').addEventListener('click', closeLeadModal);
	$('crm-modal-save').addEventListener('click', saveLeadNotes);
	$('crm-modal-delete').addEventListener('click', deleteLead);

	const authenticated = await checkSession();
	if (authenticated) {
		await bootBoard();
	} else {
		showLogin();
	}
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
