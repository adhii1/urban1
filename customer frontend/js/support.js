/**
 * TORQQ Customer Support Center Logic
 * Manages active tickets, replies history, and status updates
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'index.html';
        return;
    }

    const ticketsListContainer = document.getElementById('ticketsListContainer');
    const createTicketModal = document.getElementById('createTicketModal');
    const ticketCategory = document.getElementById('ticketCategory');
    const ticketPriority = document.getElementById('ticketPriority');
    const ticketMessage = document.getElementById('ticketMessage');
    const createTicketError = document.getElementById('createTicketError');
    const submitTicketBtn = document.getElementById('submitTicketBtn');

    const chatModal = document.getElementById('chatModal');
    const chatTicketRef = document.getElementById('chatTicketRef');
    const chatTicketCategory = document.getElementById('chatTicketCategory');
    const chatContainer = document.getElementById('chatContainer');
    const replyInput = document.getElementById('replyInput');
    const sendReplyBtn = document.getElementById('sendReplyBtn');
    const resolveTicketBtn = document.getElementById('resolveTicketBtn');

    let activeTicketId = null;

    // 1. Fetch and render tickets
    async function loadTickets() {
        try {
            const res = await CUSTOMER_API.getTickets();
            if (res.success && res.data) {
                const tickets = res.data.tickets;
                if (tickets.length === 0) {
                    ticketsListContainer.innerHTML = `
                        <div style="text-align: center; color: var(--clr-text-main); padding: 40px 0;">
                            No support tickets created yet. Click "New Ticket" to get help.
                        </div>
                    `;
                    return;
                }

                ticketsListContainer.innerHTML = tickets.map(ticket => {
                    const statusClass = ticket.status.toLowerCase() === 'resolved' ? 'status-resolved' : 'status-pending';
                    const priorityText = ticket.priority || 'Medium';
                    const refCode = ticket.ticketReference || 'SUP-TICKET';

                    return `
                        <div class="ticket-card" onclick="openChat('${ticket._id}')">
                            <div class="ticket-header">
                                <span class="ticket-ref">${refCode}</span>
                                <span class="ticket-status ${statusClass}">${ticket.status}</span>
                            </div>
                            <div style="font-size: 13px; font-weight: 600; color: var(--clr-dark-navy); margin-bottom: 4px;">
                                ${ticket.type}
                            </div>
                            <div style="font-size: 12px; color: var(--clr-text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 8px;">
                                ${ticket.message}
                            </div>
                            <div>
                                <span class="priority-badge">Priority: ${priorityText}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch (err) {
            console.error('Failed to load tickets:', err);
            ticketsListContainer.innerHTML = `<div class="text-danger" style="text-align:center; padding: 20px;">Error loading tickets.</div>`;
        }
    }

    // 2. Open chat window for ticket
    window.openChat = async (id) => {
        activeTicketId = id;
        try {
            const res = await CUSTOMER_API.getTicketDetails(id);
            if (res.success && res.data) {
                const ticket = res.data;
                chatTicketRef.textContent = ticket.ticketReference || 'SUP-TICKET';
                chatTicketCategory.textContent = ticket.type;
                
                // Toggle resolve button
                if (ticket.status.toLowerCase() === 'resolved') {
                    resolveTicketBtn.style.display = 'none';
                } else {
                    resolveTicketBtn.style.display = 'block';
                }

                // Render chat log
                renderChatLog(ticket.chatLog);
                chatModal.classList.add('show');
            }
        } catch (err) {
            console.error('Failed to fetch ticket details:', err);
        }
    };

    function renderChatLog(chatLog) {
        if (!chatLog || chatLog.length === 0) {
            chatContainer.innerHTML = '<div style="text-align:center; color:#94A3B8; font-size:12px; margin-top:20px;">No messages.</div>';
            return;
        }

        chatContainer.innerHTML = chatLog.map(msg => {
            const bubbleClass = msg.sender === 'incoming' ? 'bubble-incoming' : 'bubble-outgoing';
            return `
                <div class="chat-bubble ${bubbleClass}">
                    ${msg.text}
                    <div style="font-size: 9px; opacity: 0.7; margin-top: 4px; text-align: right;">
                        ${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            `;
        }).join('');
        
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // 3. Create support ticket
    if (submitTicketBtn) {
        submitTicketBtn.addEventListener('click', async () => {
            const category = ticketCategory.value;
            const message = ticketMessage.value.trim();
            const priority = ticketPriority.value;

            if (!message) {
                createTicketError.textContent = 'Please describe your query.';
                createTicketError.style.display = 'block';
                return;
            }

            try {
                const res = await CUSTOMER_API.createTicket({ category, message, priority });
                if (res.success) {
                    createTicketModal.classList.remove('show');
                    ticketMessage.value = '';
                    loadTickets();
                } else {
                    createTicketError.textContent = res.message || 'Failed to submit ticket.';
                    createTicketError.style.display = 'block';
                }
            } catch (err) {
                createTicketError.textContent = err.message || 'An error occurred.';
                createTicketError.style.display = 'block';
            }
        });
    }

    // 4. Send reply
    if (sendReplyBtn) {
        sendReplyBtn.addEventListener('click', async () => {
            const text = replyInput.value.trim();
            if (!text || !activeTicketId) return;

            try {
                const res = await CUSTOMER_API.replyToTicket(activeTicketId, { text });
                if (res.success && res.data) {
                    replyInput.value = '';
                    renderChatLog(res.data.chatLog);
                }
            } catch (err) {
                console.error('Failed to send reply:', err);
            }
        });
    }

    // 5. Resolve ticket
    if (resolveTicketBtn) {
        resolveTicketBtn.addEventListener('click', async () => {
            if (!activeTicketId) return;
            try {
                const res = await CUSTOMER_API.updateTicket(activeTicketId, { status: 'Resolved' });
                if (res.success) {
                    resolveTicketBtn.style.display = 'none';
                    loadTickets();
                    chatModal.classList.remove('show');
                }
            } catch (err) {
                console.error('Failed to resolve ticket:', err);
            }
        });
    }

    // Load initial list
    await loadTickets();
});
