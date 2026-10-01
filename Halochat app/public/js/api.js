window.csrfToken = () => { const item=document.cookie.split('; ').find((part)=>part.startsWith('chat_csrf='));return item?decodeURIComponent(item.slice('chat_csrf='.length)):''; };
window.api = async function api(path, options = {}) {
  let response;
  try { const method=(options.method||'GET').toUpperCase(); response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(!['GET','HEAD','OPTIONS'].includes(method)?{'X-CSRF-Token':csrfToken()}:{}), ...options.headers } }); }
  catch { throw new Error('Unable to connect. Check your connection and try again.'); }
  let data;
  try { data = await response.json(); } catch { data = { success: false, message: 'The server returned an invalid response.' }; }
  if (!response.ok) { const error = new Error(data.message || 'Request failed.'); error.status = response.status; error.errors = data.errors; if(response.status===401&&location.pathname!=='/index.html'){sessionStorage.setItem('authNotice','Your session has expired. Please sign in again.');location.replace('/index.html');} throw error; }
  return data;
};
