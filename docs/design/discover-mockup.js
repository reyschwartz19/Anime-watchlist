// Ephemeral fixture state only. No account services, storage, or recommendation API.
const saveButton = document.querySelector('.save-button');
const feedbackButtons = [...document.querySelectorAll('[data-feedback]')];
const status = document.querySelector('.status-message');
const listToggle = document.querySelector('.list-toggle');
const sampleList = document.querySelector('#sample-list');
const listContent = document.querySelector('#list-content');
const listCount = document.querySelector('.list-count');
let saved = false;
let feedback = null;

saveButton.addEventListener('click', () => {
  saved = !saved;
  saveButton.setAttribute('aria-pressed', String(saved));
  saveButton.querySelector('.save-label').textContent = saved ? 'Saved · Undo' : 'Plan to watch';
  listCount.textContent = saved ? '1' : '0';
  listCount.setAttribute('aria-label', saved ? '1 saved title' : '0 saved titles');
  listContent.textContent = saved ? 'Mushi-Shi · Plan to watch' : 'Your list is empty. Save the recommendation below to try it.';
  status.textContent = saved ? 'Mushi-Shi added to your sample list. Select Saved · Undo to remove it.' : 'Mushi-Shi removed from your sample list.';
});

for (const button of feedbackButtons) {
  button.addEventListener('click', () => {
    feedback = feedback === button.dataset.feedback ? null : button.dataset.feedback;
    for (const other of feedbackButtons) {
      other.setAttribute('aria-pressed', String(other.dataset.feedback === feedback));
    }
    status.textContent = feedback === 'more'
      ? 'Sample feedback selected: more stories like Mushi-Shi. Select again to undo.'
      : feedback === 'less'
        ? 'Sample feedback selected: Mushi-Shi is not for you. Select again to undo.'
        : 'Sample feedback cleared.';
  });
}

function setListOpen(open, { syncUrl = true, moveFocus = false } = {}) {
  sampleList.hidden = !open;
  listToggle.setAttribute('aria-expanded', String(open));
  if (syncUrl) {
    const url = new URL(window.location.href);
    if (open) url.searchParams.set('panel', 'list');
    else url.searchParams.delete('panel');
    window.history.replaceState(null, '', url);
  }
  if (moveFocus && open) document.querySelector('.close-list').focus();
}
listToggle.addEventListener('click', () => setListOpen(sampleList.hidden, { moveFocus: true }));
document.querySelector('.close-list').addEventListener('click', () => {
  setListOpen(false);
  listToggle.focus();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !sampleList.hidden) {
    setListOpen(false);
    listToggle.focus();
  }
});
const syncPanelFromUrl = () => setListOpen(new URL(window.location.href).searchParams.get('panel') === 'list', { syncUrl: false });
syncPanelFromUrl();
window.addEventListener('popstate', syncPanelFromUrl);
