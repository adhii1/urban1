// TORQQ Driver Shared State Management
// Implements a simple publish-subscribe state manager to decouple data changes from the UI

class StateManager {
    constructor() {
        this.listeners = {};
        
        // Initial State
        this.state = {
            currentDriver: this.getSavedDriver() || {
                id: "",
                name: "Loading...",
                phone: "",
                email: "",
                avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150",
                rating: 5.0,
                acceptanceRate: 100.0,
                cancellationRate: 0.0,
                experience: "N/A",
                completedTrips: 0,
                vehicle: {
                    number: "",
                    model: "No Vehicle Assigned",
                    fuelType: "",
                    mileage: "",
                    insuranceExpiry: "",
                    maintenanceDue: "",
                    tyreStatus: "",
                    photo: ""
                },
                bankDetails: {
                    bankName: "",
                    accountNo: "",
                    ifsc: "",
                    upiId: ""
                },
                achievements: [],
                reviews: []
            },
            currentTrip: null,
            notifications: [],
            theme: localStorage.getItem("torqq_driver_theme") || "light",
            onlineStatus: localStorage.getItem("torqq_driver_online") || "OFFLINE",
            wallet: {
                balance: 0.00,
                pendingSettlement: 0.00,
                transactions: [],
                incentives: [],
                referralBonus: 0.00
            },
            sosStatus: {
                active: false,
                countdown: 5 // seconds before auto-calling police/contacts
            }
        };
    }

    // Subscribe to state changes
    subscribe(key, callback) {
        if (!this.listeners[key]) {
            this.listeners[key] = [];
        }
        this.listeners[key].push(callback);
        
        // Immediately fire with current value
        callback(this.state[key]);
        
        // Return unsubscribe function
        return () => {
            this.listeners[key] = this.listeners[key].filter(cb => cb !== callback);
        };
    }

    // Update specific state key
    setState(key, newValue) {
        this.state[key] = newValue;
        
        // Save local configs if necessary
        if (key === "theme") {
            localStorage.setItem("torqq_driver_theme", newValue);
        } else if (key === "onlineStatus") {
            localStorage.setItem("torqq_driver_online", newValue);
        } else if (key === "currentDriver") {
            localStorage.setItem("torqq_driver_data", JSON.stringify(newValue));
        }

        // Notify subscribers
        if (this.listeners[key]) {
            this.listeners[key].forEach(callback => callback(newValue));
        }
    }

    getState(key) {
        return this.state[key];
    }

    getSavedDriver() {
        const saved = localStorage.getItem("torqq_driver_data");
        try {
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    }
}

// Instantiate globally
window.STATE = new StateManager();
