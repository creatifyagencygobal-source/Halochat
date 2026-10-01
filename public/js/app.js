(() => {
  const { element, avatar, hydrateIcons, openSheet, closeSheet, toast, empty } = ChatUI;

  const state = {
    currentUser: null,
    conversations: [],
    view: "chats",
    activeChat: null,
    messages: new Map(),
    pages: new Map(),
    typing: new Map(),
    searchTimer: null,
    typingTimer: null,
    typingActive: false,
    installPrompt: null,
  };

  const $ = (selector) => document.querySelector(selector);

  const formatTime = (value) =>
    value
      ? new Intl.DateTimeFormat([], {
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(value))
      : "";

  const formatListTime = (value) => {
    if (!value) return "";

    const date = new Date(value),
      now = new Date();

    return date.toDateString() === now.toDateString()
      ? formatTime(date)
      : new Intl.DateTimeFormat([], {
          month: "short",
          day: "numeric",
        }).format(date);
  };

  const initialsColor = (name = "user") => `hsl(${[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360} 68% 62%)`;

  const conversationById = (id) => state.conversations.find((item) => item.id === id);

  const currentMessages = () => state.messages.get(state.activeChat?.id) || [];

  function switchView(name) {
    state.view = name;

    document.querySelectorAll(".app-view").forEach((view) => view.classList.toggle("active", view.id === `${name}-view`));

    document.querySelectorAll("[data-nav]").forEach((button) => {
      const active = button.dataset.nav === name;

      button.classList.toggle("active", active);

      active ? button.setAttribute("aria-current", "page") : button.removeAttribute("aria-current");
    });

    $("#chat-view").classList.remove("active");
    $("#bottom-nav").classList.remove("hidden");
  }

  function normalizeConversation(item) {
    return {
      ...item,
      color: initialsColor(item.name),
      subtitle: item.type === "group" ? `${item.members.length} members` : presenceLabel(item.counterpart),
      updatedAt: formatListTime(item.lastMessageAt),
    };
  }

  function presenceLabel(user) {
    if (!user) return "";

    if (user.online) {
      return "online";
    }

    if (!user.lastSeen) {
      return "offline";
    }

    const lastSeen = new Date(user.lastSeen);
    const diffMs = Date.now() - lastSeen.getTime();

    // Future/invalid dates protection
    if (!Number.isFinite(diffMs) || diffMs < 0) {
      return "last seen just now";
    }

    const totalMinutes = Math.max(1, Math.floor(diffMs / 60000));

    // Less than 60 minutes
    if (totalMinutes < 60) {
      return `last seen ${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"} ago`;
    }

    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    // Less than 24 hours
    if (totalHours < 24) {
      if (remainingMinutes === 0) {
        return `last seen ${totalHours} ${totalHours === 1 ? "hour" : "hours"} ago`;
      }

      return `last seen ${totalHours} ${totalHours === 1 ? "hour" : "hours"} ${remainingMinutes} ${remainingMinutes === 1 ? "minute" : "minutes"} ago`;
    }

    const days = Math.floor(totalHours / 24);
    const remainingHours = totalHours % 24;

    // Under 7 days: days + hours
    if (days < 7) {
      if (remainingHours === 0) {
        return `last seen ${days} ${days === 1 ? "day" : "days"} ago`;
      }

      return `last seen ${days} ${days === 1 ? "day" : "days"} ${remainingHours} ${remainingHours === 1 ? "hour" : "hours"} ago`;
    }

    // Old activity: cleaner actual date
    return `last seen ${new Intl.DateTimeFormat([], {
      month: "short",
      day: "numeric",
      year: lastSeen.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    }).format(lastSeen)}`;
  }

  function upsertConversation(item) {
    const normalized = normalizeConversation(item);
    const index = state.conversations.findIndex((c) => c.id === item.id);

    if (index >= 0)
      state.conversations[index] = {
        ...state.conversations[index],
        ...normalized,
      };
    else state.conversations.push(normalized);

    state.conversations.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
  }

  function conversationRow(conversation) {
    const row = element("button", "conversation-row");
    row.type = "button";
    row.dataset.conversationId = conversation.id;

    const meta = element("div", "conversation-main");
    const top = element("div", "conversation-top");

    top.append(element("strong", "truncate", conversation.name), element("time", "", formatListTime(conversation.lastMessageAt)));

    const bottom = element("div", "conversation-bottom");

    const preview = conversation.lastMessage
      ? ["text", "event"].includes(conversation.lastMessage.type)
        ? conversation.lastMessage.text
        : `${conversation.lastMessage.type} attachment`
      : "Start the conversation";

    bottom.append(element("span", "truncate", preview));

    if (conversation.unreadCount) bottom.append(element("span", "unread-badge", conversation.unreadCount > 99 ? "99+" : String(conversation.unreadCount)));

    meta.append(top, bottom);

    row.append(
      avatar(
        {
          name: conversation.name,
          type: conversation.type,
          color: conversation.color,
          avatar: conversation.avatar,
        },
        "md",
      ),
      meta,
    );

    return row;
  }

  function renderConversations(query = $("#chat-search").value) {
    const list = $("#conversation-list");
    list.replaceChildren();

    const value = query.trim().toLowerCase();

    const filtered = state.conversations.filter((c) => c.name.toLowerCase().includes(value));

    if (!filtered.length) {
      list.append(
        empty(value ? "No matching chats" : "No chats yet", value ? `Nothing matches “${query}”.` : "Find someone to begin a private conversation.", "Find people", () => switchView("explore")),
      );
      return;
    }

    [
      ["Direct messages", filtered.filter((c) => c.type === "direct")],
      ["Groups", filtered.filter((c) => c.type === "group")],
    ].forEach(([label, items]) => {
      if (!items.length) return;

      list.append(element("h2", "list-label", label));

      items.forEach((c) => list.append(conversationRow(c)));
    });
  }

  function personRow(user, onAction, label = "Chat") {
    const row = element("div", "person-row");
    const info = element("div", "person-info");

    info.append(element("strong", "", user.username), element("span", "", `@${user.username}`));

    const action = element("button", "compact-button", label);

    action.type = "button";
    action.addEventListener("click", onAction);

    row.append(
      avatar(
        {
          username: user.username,
          avatar: user.avatar,
          color: initialsColor(user.username),
        },
        "md",
      ),
      info,
      action,
    );

    return row;
  }

  function renderExplore(users = [], query = "") {
    const results = $("#explore-results");

    results.replaceChildren();

    $("#explore-heading").textContent = query ? "Search results" : "Find someone";

    $("#explore-count").textContent = users.length ? String(users.length) : "";

    if (!query) {
      results.append(empty("Search by username", "Find another Halo account and start a conversation."));
      return;
    }

    if (!users.length) {
      results.append(empty("No users found", `No accounts match “@${query}”.`));
      return;
    }

    users.forEach((user) => results.append(personRow(user, () => startDirect(user))));
  }

  async function searchUsers(query, target = "explore") {
    if (!query.trim()) {
      if (target === "explore") renderExplore([], "");
      return [];
    }

    try {
      const { users } = await ChatAPI.searchUsers(query.trim());

      if (target === "explore") renderExplore(users, query);

      return users;
    } catch (error) {
      if (target === "explore") {
        $("#explore-results").replaceChildren(empty("Search unavailable", error.message));
      }

      return [];
    }
  }

  async function startDirect(user) {
    try {
      const { conversation } = await ChatAPI.createDirect(user.id);

      upsertConversation(conversation);
      renderConversations();
      openChat(conversation.id);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function messageStatus(message, conversation) {
    if (message.pending) return message.failed ? "failed" : "sending";

    if (message.sender.id !== state.currentUser.id) return "";

    const others = conversation.members.filter((m) => m.id !== state.currentUser.id);

    if (others.length && others.every((member) => member.lastReadAt && new Date(member.lastReadAt) >= new Date(message.createdAt))) return "read";

    if ((message.deliveredTo || []).some((id) => id !== state.currentUser.id)) return "delivered";

    return "sent";
  }

  function renderMessage(message, conversation, previous) {
    if (message.type === "event") return element("div", "chat-event", message.text);

    const outgoing = message.sender.id === state.currentUser.id;

    const groupStart = !outgoing && conversation.type === "group" && previous?.sender?.id !== message.sender.id;

    const row = element("div", `message-row ${outgoing ? "outgoing" : "incoming"} ${groupStart ? "group-start" : ""}`);

    row.dataset.messageId = message.id;

    const bubble = element("div", `message-bubble ${message.type || "text"} ${message.failed ? "message-failed" : ""}`);

    if (groupStart) bubble.append(element("span", "sender-name", message.sender.username));

    if (message.attachments?.length) bubble.append(renderAttachments(message));

    if (message.text) bubble.append(element("p", "message-caption", message.text));

    const progress = message.uploadProgress !== undefined ? element("div", "upload-progress") : null;

    if (progress) {
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-valuenow", String(message.uploadProgress));

      progress.append(element("span"));

      progress.firstChild.style.width = `${message.uploadProgress}%`;

      bubble.append(progress);
    }

    const meta = element("span", "message-meta", `${formatTime(message.createdAt)}${outgoing ? ` · ${messageStatus(message, conversation)}` : ""}`);

    bubble.append(meta);
    row.append(bubble);

    return row;
  }

  function renderAttachments(message) {
    const images = message.attachments.filter((item) => item.mimeType?.startsWith("image/")),
      files = message.attachments.filter((item) => !item.mimeType?.startsWith("image/"));

    const wrap = element("div", "attachment-stack");

    if (images.length) {
      const grid = element("div", `image-grid count-${Math.min(images.length, 4)}`);

      images.forEach((item) => {
        const button = element("button", "image-card");

        button.type = "button";

        button.setAttribute("aria-label", `View ${item.originalName}`);

        const image = document.createElement("img");

        image.src = item.previewUrl || item.url;
        image.alt = item.originalName;
        image.loading = "lazy";

        image.addEventListener("load", () => image.classList.add("loaded"));

        button.append(image);

        button.addEventListener("click", () => openMediaViewer(message, images, images.indexOf(item)));

        grid.append(button);
      });

      wrap.append(grid);
    }

    files.forEach((item) => {
      const card = element("div", "file-card");
      const icon = element("span");

      icon.dataset.icon = "file";

      const info = element("div", "file-info");

      info.append(element("strong", "truncate", item.originalName), element("span", "", `${String(item.format || "file").toUpperCase()} · ${formatSize(item.size)}`));

      const download = element("button", "icon-button");

      download.type = "button";
      download.ariaLabel = `Download ${item.originalName}`;
      download.dataset.icon = "download";

      download.addEventListener("click", () => downloadAttachment(message, item));

      card.append(icon, info, download);
      wrap.append(card);
    });

    hydrateIcons(wrap);

    return wrap;
  }

  function formatSize(bytes = 0) {
    if (bytes < 1024) return `${bytes} B`;

    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function dateKey(value) {
    return new Date(value).toDateString();
  }

  function renderMessages({ preserveBottom = false } = {}) {
    const list = $("#message-list");
    const oldHeight = list.scrollHeight;
    const oldTop = list.scrollTop;

    list.replaceChildren();

    const messages = currentMessages();

    if (!messages.length) list.append(empty("Start the conversation", "Send the first message."));

    let priorDate = "";

    messages.forEach((message, index) => {
      const key = dateKey(message.createdAt);

      if (key !== priorDate) {
        const sep = element("div", "date-separator");

        sep.append(element("span", "", key === new Date().toDateString() ? "Today" : key));

        list.append(sep);
        priorDate = key;
      }

      list.append(renderMessage(message, state.activeChat, messages[index - 1]));
    });

    if (preserveBottom) list.scrollTop = list.scrollHeight - oldHeight + oldTop;
  }

  function updateChatHeader() {
    const conversation = state.activeChat;

    if (!conversation) return;

    $("#chat-title").textContent = conversation.name;

    const typers = [...(state.typing.get(conversation.id) || new Map()).values()];

    $("#chat-subtitle").textContent = typers.length
      ? `${typers.map((u) => u.username).join(" and ")} ${typers.length > 1 ? "are" : "is"} typing…`
      : conversation.type === "group"
        ? `${conversation.members.length} members`
        : presenceLabel(conversation.counterpart);

    $("#chat-avatar").replaceChildren(
      avatar(
        {
          name: conversation.name,
          type: conversation.type,
          color: conversation.color,
          avatar: conversation.avatar,
        },
        "sm",
      ),
    );
  }

  async function openChat(id) {
    try {
      const existing = conversationById(id);

      const [{ conversation }, { messages, page }] = await Promise.all([ChatAPI.getConversation(id), ChatAPI.getMessages(id)]);

      upsertConversation(conversation);

      state.activeChat = conversationById(id);
      state.messages.set(id, messages);
      state.pages.set(id, page);
      state.activeChat.unreadCount = 0;

      updateChatHeader();
      renderMessages();

      $("#chat-view").classList.add("active");
      $("#bottom-nav").classList.add("hidden");

      await Realtime.join(id);

      markRead();

      requestAnimationFrame(() => {
        $("#message-list").scrollTop = $("#message-list").scrollHeight;
      });

      renderConversations();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function closeChat() {
    if (state.activeChat) {
      Realtime.typing(state.activeChat.id, false);
      Realtime.leave(state.activeChat.id);
    }

    state.activeChat = null;

    $("#chat-view").classList.remove("active");
    $("#bottom-nav").classList.remove("hidden");
  }

  async function loadOlder() {
    const conversation = state.activeChat;

    if (!conversation) return;

    const page = state.pages.get(conversation.id);

    if (!page?.hasMore || page.loading) return;

    page.loading = true;

    try {
      const result = await ChatAPI.getMessages(conversation.id, page.nextCursor);

      const known = new Set(currentMessages().map((m) => m.id));

      state.messages.set(conversation.id, [...result.messages.filter((m) => !known.has(m.id)), ...currentMessages()]);

      state.pages.set(conversation.id, result.page);

      renderMessages({
        preserveBottom: true,
      });
    } catch (error) {
      toast(error.message, "error");
    } finally {
      page.loading = false;
    }
  }

  function markRead() {
    const messages = currentMessages();
    const last = messages.at(-1);

    if (!state.activeChat || !last) return;

    Realtime.read(state.activeChat.id, last.id);

    state.activeChat.unreadCount = 0;
  }

  function makeClientId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function sendMessage(text) {
    const value = text.trim();

    if (!value || !state.activeChat) return;

    const conversation = state.activeChat;
    const clientMessageId = makeClientId();

    const optimistic = {
      id: `pending:${clientMessageId}`,
      clientMessageId,
      conversationId: conversation.id,
      text: value,
      type: "text",
      sender: state.currentUser,
      createdAt: new Date().toISOString(),
      deliveredTo: [state.currentUser.id],
      pending: true,
    };

    currentMessages().push(optimistic);

    $("#message-input").value = "";

    resizeComposer();
    renderMessages();
    scrollToBottom();

    try {
      const { message } = await Realtime.sendMessage({
        conversationId: conversation.id,
        clientMessageId,
        text: value,
      });

      const index = currentMessages().findIndex((item) => item.clientMessageId === clientMessageId);

      if (index >= 0) currentMessages()[index] = message;

      renderMessages();
    } catch (error) {
      optimistic.failed = true;
      renderMessages();
      toast(error.message, "error");
    }
  }

  function scrollToBottom() {
    const list = $("#message-list");

    list.scrollTo({
      top: list.scrollHeight,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }

  function renderProfile() {
    const user = state.currentUser;
    const root = $("#profile-content");

    root.replaceChildren();

    // PROFILE HERO
    const hero = element("section", "profile-hero profile-hero-premium");

    const avatarWrap = element("div", "profile-avatar-wrap");
    avatarWrap.append(
      avatar(
        {
          username: user.username,
          avatar: user.avatar,
          color: initialsColor(user.username),
        },
        "lg",
      ),
    );

    const name = element("h2", "", user.username);
    const handle = element("p", "", `@${user.username}`);

    const editProfile = element("button", "profile-edit-main", "Edit profile");

    editProfile.type = "button";
    editProfile.addEventListener("click", openEditProfile);

    hero.append(avatarWrap, name, handle, editProfile);

    // ACCOUNT
    const accountHeading = element("h3", "settings-heading", "Account");

    const account = element("section", "settings-card profile-settings-card glass");

    const profileAction = (iconText, titleText, subtitleText, onClick) => {
      const row = element("button", "profile-setting-action");
      const copy = element("span", "profile-setting-copy");
      const text = element("span", "profile-setting-text");
      row.type = "button";
      text.append(element("strong", "", titleText), element("small", "", subtitleText));
      copy.append(element("span", "profile-setting-icon", iconText), text);
      row.append(copy, element("span", "profile-setting-arrow", "›"));
      row.addEventListener("click", onClick);
      return row;
    };

    const usernameRow = profileAction("👤", "Username", `@${user.username}`, openEditProfile);
    const passwordRow = profileAction("🔒", "Change password", "Update your account password", openChangePassword);

    account.append(usernameRow, passwordRow);

    // APPEARANCE
    const appearanceHeading = element("h3", "settings-heading", "Appearance");

    const appearance = element("section", "settings-card glass");

    appearance.append(settingToggle("Dark mode", document.documentElement.dataset.theme === "dark", (enabled) => setTheme(enabled ? "dark" : "light")));

    // NOTIFICATIONS
    const notificationsHeading = element("h3", "settings-heading", "Notifications");

    const preferences = ChatNotifications.get();

    const notifications = element("section", "settings-card glass");

    const persist = async (key, value, toggle) => {
      try {
        const result = await ChatAPI.updateSettings({
          [key]: value,
        });

        state.currentUser.settings = result.settings;
        ChatNotifications.set(result.settings);
      } catch (error) {
        toggle.classList.toggle("on", !value);
        toggle.setAttribute("aria-checked", String(!value));
        toast(error.message, "error");
      }
    };

    notifications.append(
      settingToggle("Enable notifications", preferences.enabled, async (enabled, toggle) => {
        if (enabled) {
          try {
            if (!(await ChatNotifications.request())) {
              throw new Error(Notification.permission === "denied" ? "Notifications are blocked in browser settings." : "Notification permission is needed.");
            }
          } catch (error) {
            toggle.classList.remove("on");
            toggle.setAttribute("aria-checked", "false");
            return toast(error.message, "error");
          }
        }

        persist("notificationsEnabled", enabled, toggle);
      }),

      settingToggle("Sound", preferences.sound, (enabled, toggle) => persist("notificationSound", enabled, toggle)),

      settingToggle("Message previews", preferences.preview, (enabled, toggle) => persist("notificationPreview", enabled, toggle)),
    );

    // INSTALL
    const install = element("button", "button button-secondary hidden", "Install Halo");

    install.id = "install-app";
    install.addEventListener("click", installApp);

    if (state.installPrompt) {
      install.classList.remove("hidden");
    }

    // LOGOUT
    const logout = element("button", "button logout-button", "Log out");

    logout.addEventListener("click", logoutUser);

    root.append(
      hero,

      accountHeading,
      account,

      appearanceHeading,
      appearance,

      notificationsHeading,
      notifications,

      install,
      logout,
    );

    hydrateIcons(root);
  }

  function settingToggle(labelText, enabled, onChange) {
    const details = {
      "Dark mode": {
        icon: "◐",
        subtitle: "Switch app appearance",
      },
      "Enable notifications": {
        icon: "🔔",
        subtitle: "Get alerts for new messages",
      },
      Sound: {
        icon: "🔊",
        subtitle: "Play sounds for new messages",
      },
      "Message previews": {
        icon: "▣",
        subtitle: "Show message text in alerts",
      },
    };

    const info = details[labelText] || {
      icon: "•",
      subtitle: "",
    };

    const row = element("div", "setting-row setting-row-premium");

    const left = element("div", "setting-row-left");

    const icon = element("span", "setting-row-icon", info.icon);

    const text = element("div", "setting-row-text");

    const title = element("strong", "setting-row-title", labelText);

    text.append(title);

    if (info.subtitle) {
      const subtitle = element("small", "setting-row-subtitle", info.subtitle);

      text.append(subtitle);
    }

    left.append(icon, text);

    const toggle = element("button", "switch");

    toggle.type = "button";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-label", `${labelText}: ${enabled ? "on" : "off"}`);

    toggle.classList.toggle("on", enabled);
    toggle.setAttribute("aria-checked", String(enabled));

    toggle.addEventListener("click", () => {
      const next = !toggle.classList.contains("on");

      toggle.classList.toggle("on", next);
      toggle.setAttribute("aria-checked", String(next));

      toggle.setAttribute("aria-label", `${labelText}: ${next ? "on" : "off"}`);

      onChange(next, toggle);
    });

    row.append(left, toggle);

    return row;
  }

  function openEditProfile() {
    const content = element("div", "sheet-form"),
      photo = element("div", "profile-edit-photo");

    photo.append(
      avatar(
        {
          username: state.currentUser.username,
          avatar: state.currentUser.avatar,
          color: initialsColor(state.currentUser.username),
        },
        "lg",
      ),
    );

    const change = element("button", "compact-button", "Change photo");

    change.addEventListener("click", () => {
      const input = document.createElement("input");

      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp";

      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
          toast("Image must be 5 MB or smaller.", "error");
          return;
        }

        openAvatarCropper(file, change);
      });

      input.click();
    });

    const remove = element("button", "compact-button", "Remove photo");

    remove.disabled = !state.currentUser.avatar;

    remove.addEventListener("click", async () => {
      remove.disabled = true;

      try {
        await ChatAPI.removeAvatar();

        state.currentUser.avatar = null;

        closeSheet();
        renderProfile();
        refreshConversations();

        toast("Profile photo removed.", "success");
      } catch (error) {
        toast(error.message, "error");
        remove.disabled = false;
      }
    });

    photo.append(change, remove);

    const username = field("Username", "username"),
      password = field("Current password", "Confirm this change");

    username.querySelector("input").value = state.currentUser.username;

    password.querySelector("input").type = "password";

    const save = element("button", "button button-primary", "Save profile");

    save.addEventListener("click", async () => {
      save.disabled = true;

      try {
        const result = await ChatAPI.updateProfile(username.querySelector("input").value, password.querySelector("input").value);

        state.currentUser = result.user;

        closeSheet();
        renderProfile();
        refreshConversations();

        toast("Profile updated.", "success");
      } catch (error) {
        toast(error.message, "error");
        save.disabled = false;
      }
    });

    content.append(photo, username, password, save);

    openSheet({
      title: "Edit profile",
      content,
    });
  }

  function openChangePassword() {
    const content = element("div", "sheet-form"),
      current = field("Current password", "Current password"),
      next = field("New password", "At least 8 characters"),
      confirm = field("Confirm new password", "Repeat new password");

    [current, next, confirm].forEach((label) => (label.querySelector("input").type = "password"));

    const save = element("button", "button button-primary", "Change password");

    save.addEventListener("click", async () => {
      save.disabled = true;

      try {
        await ChatAPI.changePassword(current.querySelector("input").value, next.querySelector("input").value, confirm.querySelector("input").value);

        sessionStorage.setItem("authNotice", "Password changed. Please sign in again.");

        location.replace("/index.html");
      } catch (error) {
        toast(error.message, "error");
        save.disabled = false;
      }
    });

    content.append(current, next, confirm, save);

    openSheet({
      title: "Change password",
      content,
    });
  }

  function openAvatarCropper(file, uploadButton) {
    const imageUrl = URL.createObjectURL(file);

    const content = element("div", "avatar-crop-editor");

    const viewport = element("div", "avatar-crop-viewport");

    const img = document.createElement("img");
    img.className = "avatar-crop-image";
    img.alt = "Profile photo crop preview";
    img.src = imageUrl;
    img.draggable = false;

    viewport.append(img);

    const zoomLabel = element("label", "avatar-crop-zoom-label", "Zoom");

    const zoom = document.createElement("input");
    zoom.type = "range";
    zoom.min = "1";
    zoom.max = "3";
    zoom.step = "0.01";
    zoom.value = "1";
    zoom.className = "avatar-crop-zoom";
    zoom.setAttribute("aria-label", "Profile photo zoom");

    const actions = element("div", "avatar-crop-actions");

    const cancel = element("button", "button button-secondary", "Cancel");
    cancel.type = "button";

    const save = element("button", "button button-primary", "Save photo");
    save.type = "button";

    actions.append(cancel, save);
    content.append(viewport, zoomLabel, zoom, actions);

    let baseScale = 1;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originalX = 0;
    let originalY = 0;

    function getViewportSize() {
      return viewport.clientWidth;
    }

    function clampOffsets() {
      if (!img.naturalWidth || !img.naturalHeight) return;

      const size = getViewportSize();

      const displayedWidth = img.naturalWidth * baseScale * scale;
      const displayedHeight = img.naturalHeight * baseScale * scale;

      const maxX = Math.max(0, (displayedWidth - size) / 2);
      const maxY = Math.max(0, (displayedHeight - size) / 2);

      offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
      offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
    }

    function updateTransform() {
      clampOffsets();

      img.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${baseScale * scale})`;
    }

    img.addEventListener("load", () => {
      const size = getViewportSize();

      baseScale = Math.max(size / img.naturalWidth, size / img.naturalHeight);

      updateTransform();
    });

    zoom.addEventListener("input", () => {
      scale = Number(zoom.value);
      updateTransform();
    });

    viewport.addEventListener("pointerdown", (event) => {
      dragging = true;

      startX = event.clientX;
      startY = event.clientY;

      originalX = offsetX;
      originalY = offsetY;

      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add("dragging");
    });

    viewport.addEventListener("pointermove", (event) => {
      if (!dragging) return;

      offsetX = originalX + event.clientX - startX;
      offsetY = originalY + event.clientY - startY;

      updateTransform();
    });

    function stopDragging(event) {
      dragging = false;
      viewport.classList.remove("dragging");

      if (event.pointerId !== undefined && viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }
    }

    viewport.addEventListener("pointerup", stopDragging);
    viewport.addEventListener("pointercancel", stopDragging);

    cancel.addEventListener("click", () => {
      URL.revokeObjectURL(imageUrl);
      closeSheet();
      openEditProfile();
    });

    save.addEventListener("click", async () => {
      if (!img.naturalWidth || !img.naturalHeight) return;

      save.disabled = true;
      save.textContent = "Preparing…";

      try {
        const viewportSize = getViewportSize();

        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;

        const ctx = canvas.getContext("2d");

        if (!ctx) {
          throw new Error("Unable to prepare image.");
        }

        const finalScale = baseScale * scale;

        const displayedWidth = img.naturalWidth * finalScale;
        const displayedHeight = img.naturalHeight * finalScale;

        const imageLeft = viewportSize / 2 - displayedWidth / 2 + offsetX;

        const imageTop = viewportSize / 2 - displayedHeight / 2 + offsetY;

        const sourceX = Math.max(0, -imageLeft / finalScale);
        const sourceY = Math.max(0, -imageTop / finalScale);

        const sourceSize = viewportSize / finalScale;

        ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 512, 512);

        const blob = await new Promise((resolve) => {
          canvas.toBlob(resolve, "image/jpeg", 0.9);
        });

        if (!blob) {
          throw new Error("Could not crop image.");
        }

        const croppedFile = new File([blob], "profile-photo.jpg", {
          type: "image/jpeg",
          lastModified: Date.now(),
        });

        URL.revokeObjectURL(imageUrl);

        closeSheet();

        await uploadProfilePhoto(croppedFile, uploadButton);
      } catch (error) {
        save.disabled = false;
        save.textContent = "Save photo";
        toast(error.message || "Could not crop image.", "error");
      }
    });

    openSheet({
      title: "Adjust photo",
      content,
    });
  }

  async function uploadProfilePhoto(file, button) {
    if (!file) return;

    button.disabled = true;
    button.textContent = "Uploading 0%";

    try {
      const result = await ChatAPI.uploadAvatar(file, (progress) => (button.textContent = `Uploading ${progress}%`));

      state.currentUser.avatar = result.avatar;

      closeSheet();
      renderProfile();
      refreshConversations();

      toast("Profile photo updated.", "success");
    } catch (error) {
      toast(error.message, "error");
      button.disabled = false;
      button.textContent = "Change photo";
    }
  }

  async function logoutUser() {
    try {
      await api("/api/auth/logout", {
        method: "POST",
      });
    } catch (error) {
      if (error.status !== 401) return toast(error.message, "error");
    }

    window.location.replace("/index.html");
  }

  function openNewChat() {
    const content = element("div", "choice-grid");

    const direct = choice("chat", "New chat", "Find someone in Explore", () => {
      closeSheet();
      switchView("explore");
      $("#user-search").focus();
    });

    const group = choice("profile", "Create group", "Choose members and a name", openCreateGroup);

    content.append(direct, group);

    openSheet({
      title: "Start something",
      content,
    });
  }

  function choice(iconName, title, copy, onClick) {
    const button = element("button", "choice-card");

    button.type = "button";

    const icon = element("span");

    icon.dataset.icon = iconName;

    button.append(icon, element("strong", "", title), element("small", "", copy));

    button.addEventListener("click", onClick);

    return button;
  }

  function openCreateGroup() {
    closeSheet();

    const selected = new Map(),
      content = element("div", "sheet-form");

    const nameLabel = field("Group name", "Weekend plans");

    const name = nameLabel.querySelector("input");

    const chips = element("div", "selected-chips");

    const searchLabel = field("Add people", "Search usernames…");

    const search = searchLabel.querySelector("input");

    const list = element("div", "member-picker");

    let timer;

    const renderChips = () => {
      chips.replaceChildren();

      selected.forEach((user) => {
        const chip = element("button", "member-chip", `${user.username} ×`);

        chip.type = "button";

        chip.addEventListener("click", () => {
          selected.delete(user.id);
          renderChips();
          runSearch();
        });

        chips.append(chip);
      });
    };

    const renderUsers = (users) => {
      list.replaceChildren();

      users.forEach((user) => {
        const toggle = () => {
          selected.has(user.id) ? selected.delete(user.id) : selected.set(user.id, user);

          renderChips();
          renderUsers(users);
        };

        const row = personRow(user, toggle, selected.has(user.id) ? "Added" : "Add");

        row.querySelector("button").classList.toggle("selected", selected.has(user.id));

        list.append(row);
      });
    };

    const runSearch = () => {
      clearTimeout(timer);

      timer = setTimeout(async () => renderUsers(await searchUsers(search.value, "picker")), 250);
    };

    search.addEventListener("input", runSearch);

    const create = element("button", "button button-primary", "Create group");

    create.addEventListener("click", async () => {
      if (!name.value.trim()) return toast("Add a group name.", "error");

      if (selected.size < 2) return toast("Select at least two people.", "error");

      create.disabled = true;

      try {
        const { conversation } = await ChatAPI.createGroup(name.value.trim(), [...selected.keys()]);

        upsertConversation(conversation);
        renderConversations();
        closeSheet();

        toast("Group created.", "success");

        openChat(conversation.id);
      } catch (error) {
        toast(error.message, "error");
        create.disabled = false;
      }
    });

    content.append(nameLabel, element("span", "form-label", "Selected"), chips, searchLabel, list, create);

    openSheet({
      title: "Create group",
      content,
    });
  }

  function field(labelText, placeholder) {
    const label = element("label", "field");

    label.append(element("span", "", labelText));

    const input = document.createElement("input");

    input.placeholder = placeholder;

    label.append(input);

    return label;
  }

  function openAttachments() {
    const input = document.createElement("input");

    input.type = "file";
    input.multiple = true;
    input.accept = ".jpg,.jpeg,.png,.webp,.pdf,.docx,.txt,.zip,.csv,.pptx,.xlsx";

    input.addEventListener("change", () => openUploadPreview([...input.files]));

    input.click();
  }

  function openUploadPreview(files) {
    if (!files.length) return;

    if (files.length > 10) return toast("Choose up to 10 attachments.", "error");

    const content = element("div", "sheet-form"),
      previews = element("div", "upload-previews");

    const selected = [...files];

    const render = () => {
      previews.replaceChildren();

      selected.forEach((file, index) => {
        const item = element("div", "upload-preview-item");

        if (file.type.startsWith("image/")) {
          const image = document.createElement("img");

          image.src = URL.createObjectURL(file);

          image.alt = "Selected image preview";

          item.append(image);
        } else {
          const icon = element("span");

          icon.dataset.icon = "file";

          item.append(icon);
        }

        const info = element("div", "file-info");

        info.append(element("strong", "truncate", file.name), element("span", "", formatSize(file.size)));

        const remove = element("button", "icon-button");

        remove.type = "button";
        remove.ariaLabel = `Remove ${file.name}`;
        remove.dataset.icon = "close";

        remove.addEventListener("click", () => {
          selected.splice(index, 1);
          render();
        });

        item.append(info, remove);
        previews.append(item);
      });

      hydrateIcons(previews);
    };

    const label = field("Caption (optional)", "Add a message…");

    const send = element("button", "button button-primary", "Send attachments");

    send.addEventListener("click", async () => {
      if (!selected.length) return toast("Choose at least one file.", "error");

      send.disabled = true;

      const clientMessageId = makeClientId(),
        optimistic = {
          id: `pending:${clientMessageId}`,
          clientMessageId,
          conversationId: state.activeChat.id,
          text: label.querySelector("input").value,
          type: selected.every((file) => file.type.startsWith("image/")) ? "image" : "file",
          sender: state.currentUser,
          createdAt: new Date().toISOString(),
          attachments: selected.map((file) => ({
            originalName: file.name,
            mimeType: file.type,
            size: file.size,
            format: file.name.split(".").pop(),
            previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
          })),
          deliveredTo: [state.currentUser.id],
          pending: true,
          uploadProgress: 0,
        };

      currentMessages().push(optimistic);

      closeSheet();
      renderMessages();
      scrollToBottom();

      try {
        const uploadFiles = await Promise.all(selected.map(compressImage));

        const result = await ChatAPI.uploadAttachments(state.activeChat.id, uploadFiles, optimistic.text, clientMessageId, (progress) => {
          optimistic.uploadProgress = progress;

          renderMessages();
        });

        const index = currentMessages().findIndex((message) => message.clientMessageId === clientMessageId);

        if (index >= 0) currentMessages()[index] = result.message;

        renderMessages();
      } catch (error) {
        optimistic.failed = true;

        delete optimistic.uploadProgress;

        renderMessages();

        toast(error.message, "error");
      }
    });

    content.append(previews, label, send);

    render();

    openSheet({
      title: "Ready to send",
      content,
    });
  }

  async function compressImage(file) {
    if (!file.type.startsWith("image/") || file.size < 500000 || !("createImageBitmap" in window)) return file;

    try {
      const bitmap = await createImageBitmap(file),
        scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height)),
        canvas = document.createElement("canvas");

      canvas.width = Math.round(bitmap.width * scale);

      canvas.height = Math.round(bitmap.height * scale);

      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.84));

      bitmap.close();

      if (!blob || blob.size >= file.size) return file;

      return new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
        type: "image/webp",
        lastModified: Date.now(),
      });
    } catch {
      return file;
    }
  }

  async function downloadAttachment(message, item) {
    try {
      const result = await ChatAPI.recordDownload(message.id, item.index);

      const link = document.createElement("a");

      link.href = result.url;
      link.download = item.originalName;
      link.rel = "noopener";

      link.click();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function openMediaViewer(message, images, startIndex = 0) {
    let index = startIndex;

    const overlay = element("div", "media-viewer");

    overlay.setAttribute("role", "dialog");

    overlay.setAttribute("aria-modal", "true");

    const image = document.createElement("img");

    const top = element("div", "media-viewer-bar");

    const close = element("button", "icon-button");

    close.dataset.icon = "close";
    close.ariaLabel = "Close image viewer";

    const download = element("button", "icon-button");

    download.dataset.icon = "download";
    download.ariaLabel = "Download image";

    const info = element("span", "media-viewer-info");

    const show = () => {
      const item = images[index];

      image.src = item.url;
      image.alt = item.originalName;

      info.textContent = `${item.originalName} · ${index + 1}/${images.length}`;
    };

    close.addEventListener("click", () => overlay.remove());

    download.addEventListener("click", () => downloadAttachment(message, images[index]));

    top.append(close, info, download);
    overlay.append(top, image);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });

    document.body.append(overlay);

    hydrateIcons(overlay);
    show();
  }

  function openChatMenu() {
    if (!state.activeChat) return;

    const conversation = state.activeChat,
      content = element("div", "menu-list");

    const addRow = (label, onClick, danger = false) => {
      const button = element("button", `menu-row${danger ? " danger" : ""}`, label);

      button.type = "button";

      button.addEventListener("click", onClick);

      content.append(button);
    };

    if (conversation.type === "group") {
      addRow("Group info", openGroupInfo);

      addRow(conversation.muted ? "Unmute notifications" : "Mute notifications", () => toggleConversationMute(conversation));

      addRow("Members", openGroupInfo);
    } else {
      addRow("View profile", () => openDirectProfile(conversation));

      addRow(conversation.muted ? "Unmute notifications" : "Mute notifications", () => toggleConversationMute(conversation));

      addRow("Clear chat", () => openClearChatConfirmation(conversation), true);
    }

    openSheet({
      title: "Conversation options",
      content,
    });
  }

  function openDirectProfile(conversation) {
    const user = conversation.counterpart;

    if (!user) return;

    const content = element("div", "group-info"),
      hero = element("div", "group-info-hero");

    hero.append(
      avatar(
        {
          username: user.username,
          avatar: user.avatar,
          color: initialsColor(user.username),
        },
        "lg",
      ),
      element("h3", "", user.username),
      element("p", "", presenceLabel(user)),
    );

    content.append(hero);

    openSheet({
      title: "Profile",
      content,
    });
  }

  async function toggleConversationMute(conversation) {
    const next = !conversation.muted,
      button = document.activeElement;

    if (button instanceof HTMLButtonElement) {
      button.disabled = true;

      button.textContent = next ? "Muting…" : "Unmuting…";
    }

    try {
      const result = await ChatAPI.setConversationMute(conversation.id, next);

      upsertConversation(result.conversation);

      if (state.activeChat?.id === conversation.id) state.activeChat = conversationById(conversation.id);

      closeSheet();
      renderConversations();

      toast(next ? "Notifications muted." : "Notifications unmuted.", "success");
    } catch (error) {
      if (button instanceof HTMLButtonElement) button.disabled = false;

      toast(error.message, "error");
    }
  }

  function openClearChatConfirmation(conversation) {
    const content = element("div", "sheet-form");

    content.append(element("p", "sheet-copy", "This removes the conversation history from your view. It won't clear it for the other person."));

    const actions = element("div", "confirm-actions"),
      cancel = element("button", "button button-secondary", "Cancel"),
      clear = element("button", "button button-danger", "Clear chat");

    cancel.type = "button";
    clear.type = "button";

    cancel.addEventListener("click", closeSheet);

    clear.addEventListener("click", async () => {
      clear.disabled = true;
      cancel.disabled = true;
      clear.textContent = "Clearing…";

      try {
        const result = await ChatAPI.clearConversation(conversation.id);

        upsertConversation(result.conversation);

        state.activeChat = conversationById(conversation.id);

        state.messages.set(conversation.id, []);

        state.pages.set(conversation.id, {
          hasMore: false,
          nextCursor: null,
        });

        renderMessages();
        renderConversations();
        closeSheet();

        toast("Chat cleared.", "success");
      } catch (error) {
        clear.disabled = false;
        cancel.disabled = false;
        clear.textContent = "Clear chat";

        toast(error.message, "error");
      }
    });

    actions.append(cancel, clear);
    content.append(actions);

    openSheet({
      title: "Clear chat?",
      content,
    });
  }

  function openGroupInfo() {
    const conversation = state.activeChat,
      isAdmin = conversation.admins.includes(state.currentUser.id);

    closeSheet();

    const content = element("div", "group-info"),
      hero = element("div", "group-info-hero");

    hero.append(
      avatar(
        {
          name: conversation.name,
          type: "group",
          color: conversation.color,
          avatar: conversation.avatar,
        },
        "lg",
      ),
      element("h3", "", conversation.name),
      element("p", "", `${conversation.members.length} members`),
    );

    content.append(hero);

    if (isAdmin) {
      const rename = element("button", "button button-secondary", "Rename group");

      rename.addEventListener("click", () => openRenameGroup(conversation));

      const add = element("button", "button button-secondary", "Add members");

      add.addEventListener("click", () => openAddMembers(conversation));

      content.append(rename, add);
    }

    content.append(element("h4", "", "Members"));

    conversation.members.forEach((user) => {
      const canRemove = isAdmin && user.id !== state.currentUser.id,
        row = personRow(user, () => canRemove && removeGroupMember(conversation, user), canRemove ? "Remove" : user.isAdmin ? "Admin" : "Member");

      row.querySelector("button").disabled = !canRemove;

      content.append(row);
    });

    const leave = element("button", "button logout-button", "Leave group");

    leave.addEventListener("click", () => leaveGroup(conversation));

    content.append(leave);

    openSheet({
      title: "Group info",
      content,
    });
  }

  async function applyGroup(result) {
    upsertConversation(result.conversation);

    state.activeChat = conversationById(result.conversation.id);

    updateChatHeader();
    renderConversations();
    closeSheet();
  }

  function openRenameGroup(conversation) {
    const content = element("div", "sheet-form"),
      name = field("Group name", "Group name");

    name.querySelector("input").value = conversation.name;

    const save = element("button", "button button-primary", "Save");

    save.addEventListener("click", async () => {
      try {
        await applyGroup(await ChatAPI.renameGroup(conversation.id, name.querySelector("input").value));

        toast("Group renamed.", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });

    content.append(name, save);

    openSheet({
      title: "Rename group",
      content,
    });
  }

  function openAddMembers(conversation) {
    const content = element("div", "sheet-form"),
      search = field("Search people", "Username"),
      list = element("div", "member-picker"),
      selected = new Map(),
      save = element("button", "button button-primary", "Add members");

    let timer;

    search.querySelector("input").addEventListener("input", (event) => {
      clearTimeout(timer);

      timer = setTimeout(async () => {
        const users = (await searchUsers(event.target.value, "picker")).filter((u) => !conversation.members.some((m) => m.id === u.id));

        list.replaceChildren();

        users.forEach((u) =>
          list.append(
            personRow(
              u,
              () => {
                selected.has(u.id) ? selected.delete(u.id) : selected.set(u.id, u);

                event.target.dispatchEvent(new Event("input"));
              },
              selected.has(u.id) ? "Added" : "Add",
            ),
          ),
        );
      }, 250);
    });

    save.addEventListener("click", async () => {
      if (!selected.size) return toast("Select at least one person.", "error");

      try {
        await applyGroup(await ChatAPI.addMembers(conversation.id, [...selected.keys()]));

        toast("Members added.", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });

    content.append(search, list, save);

    openSheet({
      title: "Add members",
      content,
    });
  }

  async function removeGroupMember(conversation, user) {
    if (!confirm(`Remove ${user.username} from this group?`)) return;

    try {
      await applyGroup(await ChatAPI.removeMember(conversation.id, user.id));

      toast(`${user.username} removed.`, "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function leaveGroup(conversation) {
    if (!confirm("Leave this group?")) return;

    try {
      await ChatAPI.leaveGroup(conversation.id);

      state.conversations = state.conversations.filter((c) => c.id !== conversation.id);

      closeSheet();
      closeChat();
      renderConversations();

      toast("You left the group.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function resizeComposer() {
    const input = $("#message-input");

    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;

    $("#send-message").disabled = !input.value.trim();

    if (!state.activeChat) return;

    const active = Boolean(input.value.trim());

    if (active && !state.typingActive) {
      state.typingActive = true;

      Realtime.typing(state.activeChat.id, true);
    }

    clearTimeout(state.typingTimer);

    state.typingTimer = setTimeout(() => {
      if (state.typingActive && state.activeChat) {
        Realtime.typing(state.activeChat.id, false);

        state.typingActive = false;
      }
    }, 1200);
  }

  function handleNewMessage(message) {
    const conversation = conversationById(message.conversationId);

    if (!conversation) {
      refreshConversations();
      return;
    }

    const messages = state.messages.get(message.conversationId) || [];

    const existing = messages.findIndex((item) => item.clientMessageId === message.clientMessageId || item.id === message.id);

    if (existing >= 0) messages[existing] = message;
    else messages.push(message);

    state.messages.set(message.conversationId, messages);

    conversation.lastMessage = {
      id: message.id,
      text: message.text,
      type: message.type,
      sender: message.sender,
      createdAt: message.createdAt,
    };

    conversation.lastMessageAt = message.createdAt;

    if (message.sender.id !== state.currentUser.id) {
      Realtime.delivered(message.id);

      if (state.activeChat?.id === message.conversationId && document.visibilityState === "visible") {
        renderMessages();

        const list = $("#message-list");

        const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 140;

        if (nearBottom) scrollToBottom();

        markRead();
      } else {
        conversation.unreadCount = (conversation.unreadCount || 0) + 1;

        const preview =
          message.type === "text" ? message.text : message.type === "event" ? message.text : `Sent ${message.attachments?.length || 1} attachment${message.attachments?.length === 1 ? "" : "s"}`;

        if (!conversation.muted)
          ChatNotifications.show({
            title: conversation.type === "group" ? conversation.name : message.sender.username,
            body: conversation.type === "group" ? `${message.sender.username}: ${preview}` : preview,
            conversationId: conversation.id,
            messageId: message.id,
          });
      }
    }

    state.conversations.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    renderConversations();
  }

  function handleDelivered({ messageId, userId }) {
    for (const messages of state.messages.values()) {
      const message = messages.find((item) => item.id === messageId);

      if (message && !message.deliveredTo.includes(userId)) message.deliveredTo.push(userId);
    }

    if (state.activeChat) renderMessages();
  }

  function handleRead({ conversationId, userId, readAt, messageId }) {
    const conversation = conversationById(conversationId);

    const member = conversation?.members.find((item) => item.id === userId);

    if (member) {
      member.lastReadAt = readAt;
      member.lastReadMessage = messageId;
    }

    if (state.activeChat?.id === conversationId) renderMessages();
  }

  function handlePresence(payload) {
    state.conversations.forEach((conversation) => {
      const member = conversation.members.find((item) => item.id === payload.userId);

      if (member) {
        member.online = payload.online;

        member.lastSeen = payload.lastSeen || member.lastSeen;
      }

      if (conversation.counterpart?.id === payload.userId) {
        conversation.counterpart.online = payload.online;

        conversation.counterpart.lastSeen = payload.lastSeen || conversation.counterpart.lastSeen;
      }
    });

    if (state.activeChat) updateChatHeader();

    renderConversations();
  }

  function handleTyping(payload, active) {
    if (!state.typing.has(payload.conversationId)) state.typing.set(payload.conversationId, new Map());

    const map = state.typing.get(payload.conversationId);

    if (active) {
      map.set(payload.user.id, payload.user);

      setTimeout(() => {
        map.delete(payload.user.id);

        if (state.activeChat?.id === payload.conversationId) updateChatHeader();
      }, 2500);
    } else map.delete(payload.user.id);

    if (state.activeChat?.id === payload.conversationId) updateChatHeader();
  }

  async function refreshConversations() {
    try {
      const { conversations } = await ChatAPI.getConversations();

      state.conversations = conversations.map(normalizeConversation);

      renderConversations();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function bindRealtime() {
    Realtime.on("conversation:created", (conversation) => {
      upsertConversation(conversation);
      renderConversations();
    });

    Realtime.on("conversation:updated", (conversation) => {
      upsertConversation(conversation);

      if (state.activeChat?.id === conversation.id) {
        state.activeChat = conversationById(conversation.id);

        updateChatHeader();
      }

      renderConversations();
    });

    Realtime.on("conversation:settings", ({ conversationId, muted }) => {
      const conversation = conversationById(conversationId);

      if (conversation) conversation.muted = muted;

      if (state.activeChat?.id === conversationId) state.activeChat.muted = muted;

      renderConversations();
    });

    Realtime.on("conversation:cleared", ({ conversationId, conversation }) => {
      upsertConversation(conversation);

      state.messages.set(conversationId, []);

      state.pages.set(conversationId, {
        hasMore: false,
        nextCursor: null,
      });

      if (state.activeChat?.id === conversationId) {
        state.activeChat = conversationById(conversationId);

        renderMessages();
      }

      renderConversations();
    });

    Realtime.on("conversation:removed", ({ conversationId }) => {
      state.conversations = state.conversations.filter((c) => c.id !== conversationId);

      if (state.activeChat?.id === conversationId) {
        closeChat();

        toast("You no longer have access to that conversation.", "error");
      }

      renderConversations();
    });

    Realtime.on("message:new", handleNewMessage);

    Realtime.on("message:delivered", handleDelivered);

    Realtime.on("message:read", handleRead);

    Realtime.on("presence:update", handlePresence);

    Realtime.on("profile:updated", handleProfileUpdated);

    Realtime.on("typing:start", (payload) => handleTyping(payload, true));

    Realtime.on("typing:stop", (payload) => handleTyping(payload, false));

    Realtime.on("connection", ({ state: connectionState, reconnected }) => {
      if (connectionState === "offline") toast("Realtime connection lost. Reconnecting…", "error");

      if (reconnected) {
        toast("Back online.", "success");

        refreshConversations();

        if (state.activeChat) Realtime.join(state.activeChat.id);
      }
    });

    Realtime.connect();
  }

  function handleProfileUpdated({ userId, avatar: nextAvatar, username }) {
    if (userId === state.currentUser.id) {
      state.currentUser.avatar = nextAvatar;

      if (username) state.currentUser.username = username;

      renderProfile();
    }

    state.conversations.forEach((conversation) => {
      conversation.members.forEach((member) => {
        if (member.id === userId) {
          member.avatar = nextAvatar;

          if (username) member.username = username;
        }
      });

      if (conversation.counterpart?.id === userId) {
        conversation.counterpart.avatar = nextAvatar;

        conversation.avatar = nextAvatar;

        if (username) {
          conversation.counterpart.username = username;

          conversation.name = username;
        }
      }
    });

    for (const messages of state.messages.values())
      messages.forEach((message) => {
        if (message.sender?.id === userId) {
          message.sender.avatar = nextAvatar;

          if (username) message.sender.username = username;
        }
      });

    if (state.activeChat) {
      updateChatHeader();
      renderMessages();
    }

    renderConversations();
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const nav = event.target.closest("[data-nav]");

      if (nav) switchView(nav.dataset.nav);

      const row = event.target.closest("[data-conversation-id]");

      if (row) openChat(row.dataset.conversationId);

      const action = event.target.closest("[data-action]")?.dataset.action;

      if (action === "back") closeChat();

      if (action === "new-chat") openNewChat();

      if (action === "attachments") openAttachments();

      if (action === "chat-menu") openChatMenu();
    });

    $("#chat-search").addEventListener("input", (event) => renderConversations(event.target.value));

    $("#user-search").addEventListener("input", (event) => {
      clearTimeout(state.searchTimer);

      const query = event.target.value;

      $("#explore-results").replaceChildren(query ? element("div", "empty-state", "Searching…") : empty("Search by username", "Find another Halo account and start a conversation."));

      state.searchTimer = setTimeout(() => searchUsers(query), 300);
    });

    $("#message-input").addEventListener("input", resizeComposer);

    $("#message-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();

        sendMessage(event.currentTarget.value);
      }
    });

    $("#composer").addEventListener("submit", (event) => {
      event.preventDefault();

      sendMessage($("#message-input").value);
    });

    $("#message-list").addEventListener("scroll", (event) => {
      if (event.currentTarget.scrollTop < 80) loadOlder();
    });
  }

  async function installApp() {
    if (!state.installPrompt) return;

    await state.installPrompt.prompt();

    state.installPrompt = null;

    renderProfile();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();

    state.installPrompt = event;

    if (state.currentUser) renderProfile();
  });

  window.addEventListener("offline", () => toast("You're offline. Messages cannot be sent until you reconnect.", "error"));

  window.addEventListener("online", () => toast("Back online.", "success"));

  async function init() {
    hydrateIcons();
    bindEvents();
    renderExplore([], "");

    try {
      const me = await api("/api/auth/me");

      state.currentUser = me.user;

      ChatNotifications.set(me.user.settings);

      const conversations = await ChatAPI.getConversations();

      state.conversations = conversations.conversations.map(normalizeConversation);

      renderProfile();
      renderConversations();
      bindRealtime();
    } catch {
      window.location.replace("/index.html");
    }
  }

  init();
})();
