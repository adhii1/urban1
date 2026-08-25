/**
 * TORQQ Customer Profile Operations
 * Handles profile updates, avatar uploads, and emergency contacts
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'index.html';
        return;
    }

    const editName = document.getElementById('editName');
    const editEmail = document.getElementById('editEmail');
    const btnSaveProfile = document.getElementById('btnSaveProfile');
    const profileAvatar = document.getElementById('profileAvatar');
    const avatarFileInput = document.getElementById('avatarFileInput');
    const btnChangePhoto = document.getElementById('btnChangePhoto');
    const btnRemovePhoto = document.getElementById('btnRemovePhoto');
    
    const contactsContainer = document.getElementById('contactsContainer');
    const btnAddContact = document.getElementById('btnAddContact');
    const contactModal = document.getElementById('contactModal');
    const contactName = document.getElementById('contactName');
    const contactPhone = document.getElementById('contactPhone');
    const btnSubmitContact = document.getElementById('btnSubmitContact');
    const btnLogout = document.getElementById('btnLogout');

    // 1. Load Profile
    await fetchProfileDetails();
    
    // 2. Load Emergency Contacts
    await fetchEmergencyContacts();

    async function fetchProfileDetails() {
        try {
            const res = await CUSTOMER_API.getProfile();
            if (res.success && res.data) {
                const user = res.data;
                if (editName) editName.value = user.name || '';
                if (editEmail) editEmail.value = user.email || '';

                if (profileAvatar) {
                    if (user.avatar) {
                        profileAvatar.src = window.TORQQ_ASSET_URL
                            ? window.TORQQ_ASSET_URL(user.avatar)
                            : `/${user.avatar}`;
                        if (btnRemovePhoto) btnRemovePhoto.style.display = 'inline-block';
                    } else {
                        profileAvatar.src = 'assets/images/default-avatar.png';
                        if (btnRemovePhoto) btnRemovePhoto.style.display = 'none';
                    }
                }
            }
        } catch (err) {
            console.error('Error fetching profile:', err);
        }
    }

    // Save profile changes
    if (btnSaveProfile) {
        btnSaveProfile.addEventListener('click', async () => {
            const name = editName.value.trim();
            const email = editEmail.value.trim();

            if (!name) {
                alert('Name cannot be empty.');
                return;
            }

            try {
                const res = await CUSTOMER_API.updateProfile({ name, email });
                if (res.success) {
                    alert('Profile updated successfully!');
                    localStorage.setItem('userName', name);
                }
            } catch (err) {
                alert(`Update failed: ${err.message}`);
            }
        });
    }

    // Trigger file chooser
    if (btnChangePhoto && avatarFileInput) {
        btnChangePhoto.addEventListener('click', () => avatarFileInput.click());
    }
    if (profileAvatar && avatarFileInput) {
        profileAvatar.addEventListener('click', () => avatarFileInput.click());
    }

    // Handle file selection and upload
    if (avatarFileInput) {
        avatarFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('avatar', file);

            try {
                const res = await CUSTOMER_API.uploadProfileImage(formData);
                if (res.success && res.data) {
                    alert('Avatar uploaded successfully!');
                    await fetchProfileDetails();
                }
            } catch (err) {
                alert(`Upload failed: ${err.message}`);
            }
        });
    }

    // Handle Remove Photo
    if (btnRemovePhoto) {
        btnRemovePhoto.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to remove your profile photo?')) return;

            try {
                const res = await CUSTOMER_API.removeProfileImage();
                if (res.success) {
                    alert('Profile photo removed.');
                    await fetchProfileDetails();
                }
            } catch (err) {
                alert(`Failed to remove photo: ${err.message}`);
            }
        });
    }

    // 3. Emergency Contacts Operations
    async function fetchEmergencyContacts() {
        if (!contactsContainer) return;
        contactsContainer.innerHTML = '<p style="color: var(--clr-text-light); text-align: center; padding: 16px 0;">Loading contacts...</p>';

        try {
            const res = await CUSTOMER_API.getEmergencyContacts();
            if (res.success && res.data) {
                const contacts = res.data;
                
                if (contacts.length === 0) {
                    contactsContainer.innerHTML = '<p style="color: var(--clr-text-light); text-align: center; padding: 16px 0;">No emergency contacts added yet.</p>';
                    return;
                }

                let html = '';
                contacts.forEach(c => {
                    html += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #F1F5F9;">
                            <div>
                                <h4 style="font-weight: 600; color: var(--clr-dark-navy); font-size: 14px;">${c.name}</h4>
                                <p style="color: var(--clr-text-light); font-size: 12px;">+91 ${c.phone}</p>
                            </div>
                            <button class="btn-text btnDeleteContact" data-id="${c._id}" style="color: #ef4444; font-size: 12px; font-weight: 500;">Delete</button>
                        </div>
                    `;
                });
                contactsContainer.innerHTML = html;

                // Bind deletes
                contactsContainer.querySelectorAll('.btnDeleteContact').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const id = btn.getAttribute('data-id');
                        if (!confirm('Remove this emergency contact?')) return;

                        try {
                            const delRes = await CUSTOMER_API.deleteEmergencyContact(id);
                            if (delRes.success) {
                                alert('Contact removed successfully.');
                                await fetchEmergencyContacts();
                            }
                        } catch (err) {
                            alert(`Failed to delete: ${err.message}`);
                        }
                    });
                });
            }
        } catch (err) {
            contactsContainer.innerHTML = `<p style="color: #ef4444; text-align: center; padding: 16px 0;">Failed to load: ${err.message}</p>`;
        }
    }

    // Modal Trigger
    if (btnAddContact && contactModal) {
        btnAddContact.addEventListener('click', () => {
            if (contactName) contactName.value = '';
            if (contactPhone) contactPhone.value = '';
            contactModal.classList.add('show');
        });
    }

    // Submit emergency contact
    if (btnSubmitContact) {
        btnSubmitContact.addEventListener('click', async () => {
            const name = contactName.value.trim();
            const phone = contactPhone.value.trim();

            if (!name || !phone) {
                alert('Please provide name and phone.');
                return;
            }

            try {
                const res = await CUSTOMER_API.addEmergencyContact({ name, phone });
                if (res.success) {
                    alert('Emergency contact added successfully!');
                    contactModal.classList.remove('show');
                    await fetchEmergencyContacts();
                }
            } catch (err) {
                alert(`Failed to save contact: ${err.message}`);
            }
        });
    }

    // 4. Load Pinned Favourites
    await fetchFavourites();

    async function fetchFavourites() {
        const favouritesContainer = document.getElementById('favouritesContainer');
        if (!favouritesContainer) return;
        favouritesContainer.innerHTML = '<p style="color: var(--clr-text-light); text-align: center; padding: 16px 0;">Loading favourites...</p>';

        try {
            const res = await CUSTOMER_API.getFavourites();
            if (res.success && res.data && res.data.pinned) {
                const { routes, pickupStops, dropStops, drivers, searches } = res.data.pinned;
                const allPins = [
                    ...(routes || []),
                    ...(pickupStops || []),
                    ...(dropStops || []),
                    ...(drivers || []),
                    ...(searches || [])
                ];

                if (allPins.length === 0) {
                    favouritesContainer.innerHTML = '<p style="color: var(--clr-text-light); text-align: center; padding: 16px 0;">No favourites pinned yet.</p>';
                    return;
                }

                let html = '';
                allPins.forEach(p => {
                    let title = 'Pinned Bookmark';
                    let subtitle = p.type;
                    if (p.type === 'ROUTE') {
                        title = 'Favourite Route';
                        subtitle = `Route ID: ${p.routeId || 'Custom'}`;
                    } else if (p.type === 'STOP_PICKUP' || p.type === 'STOP_DROP') {
                        title = p.type === 'STOP_PICKUP' ? 'Favourite Pickup Stop' : 'Favourite Drop Stop';
                        subtitle = `Stop ID: ${p.stopId || 'Custom'}`;
                    } else if (p.type === 'DRIVER') {
                        title = 'Favourite Driver';
                        subtitle = `Driver Partner ID: ${p.driverId || 'Custom'}`;
                    } else if (p.type === 'SEARCH') {
                        title = 'Saved Search';
                        subtitle = p.searchQuery || 'Empty query';
                    }

                    html += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #F1F5F9;">
                            <div>
                                <h4 style="font-weight: 600; color: var(--clr-dark-navy); font-size: 13px;">${title}</h4>
                                <p style="color: var(--clr-text-light); font-size: 11px;">${subtitle}</p>
                            </div>
                            <button class="btn-text btnDeleteFavourite" data-id="${p._id}" style="color: #ef4444; font-size: 12px; font-weight: 500;">Unpin</button>
                        </div>
                    `;
                });
                favouritesContainer.innerHTML = html;

                // Bind deletes
                favouritesContainer.querySelectorAll('.btnDeleteFavourite').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const id = btn.getAttribute('data-id');
                        if (!confirm('Unpin this favourite bookmark?')) return;

                        try {
                            const delRes = await CUSTOMER_API.deleteFavourite(id);
                            if (delRes.success) {
                                alert('Unpinned successfully.');
                                await fetchFavourites();
                            }
                        } catch (err) {
                            alert(`Failed to unpin: ${err.message}`);
                        }
                    });
                });
            }
        } catch (err) {
            favouritesContainer.innerHTML = `<p style="color: #ef4444; text-align: center; padding: 16px 0;">Failed to load: ${err.message}</p>`;
        }
    }

    // Logout trigger
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            CUSTOMER_API.logout();
        });
    }
});
