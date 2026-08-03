"use client";

import { useCustomerDashboard, type CustomerProfile } from "@/lib/hooks/useCustomerQueries";
import { useCustomerStore } from "@/stores/customerStore";
import { api } from "@/lib/api/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api/queryKeys";
import { AlertCircle, Car, Clock, Loader, MapPin, User } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import LocationSelector from "../profile/LocationSelector";

export default function CustomerDashboardPage() {
  const { profile, trips, subscription, isLoading } = useCustomerDashboard();
  const queryClient = useQueryClient();

  const updateLocationMutation = useMutation({
    mutationFn: (payload: { field: string; value: { address: string; coordinates: [number, number] } }) =>
      api.put<CustomerProfile>("/customer/profile", { [payload.field]: payload.value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customer.profile() });
      setLocationToSet(null);
    },
  });

  const [locationToSet, setLocationToSet] = useState<"pickup" | "drop" | null>(
    null,
  );

  const upcomingTrip = (trips.data || []).find(
    (t: any) => t.status === "SCHEDULED" || t.status === "IN_PROGRESS",
  );

  if (isLoading) {
    return (
      <div
        style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}
      >
        <Loader size={24} color="#16C15D" />
      </div>
    );
  }

  return (
    <div>
      <h2
        style={{
          fontSize: "18px",
          fontWeight: 800,
          color: "#0F172A",
          marginBottom: "16px",
        }}
      >
        Dashboard
      </h2>

      {/* Subscription Status */}
      {subscription.data && (
        <div
          style={{
            background: "#FFF",
            borderRadius: "14px",
            padding: "16px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: "11px", color: "#64748B" }}>
                Subscription
              </div>
              <div
                style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A" }}
              >
                {subscription.data.planType ||
                  subscription.data.plan ||
                  "Active"}
              </div>
            </div>
            <span
              style={{
                padding: "4px 12px",
                borderRadius: "12px",
                fontSize: "10px",
                fontWeight: 600,
                background:
                  subscription.data.status === "ACTIVE" ? "#DCFCE7" : "#FEF3C7",
                color:
                  subscription.data.status === "ACTIVE" ? "#16C15D" : "#F59E0B",
              }}
            >
              {subscription.data.status || "Active"}
            </span>
          </div>
        </div>
      )}

      {/* Assigned Driver & Route */}
      <div
        style={{
          background: "#FFF",
          borderRadius: "14px",
          padding: "16px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          marginBottom: "16px",
        }}
      >
        <h3
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "#0F172A",
            marginBottom: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Car size={16} /> Assigned Route & Driver
        </h3>
        {profile.data ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px",
                background: "#F0FDF4",
                borderRadius: "10px",
                cursor: "pointer",
                transition: "all 0.2s",
                border: "2px solid transparent",
              }}
              onClick={() => setLocationToSet("pickup")}
            >
              <MapPin size={14} color="#16C15D" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "10px", color: "#64748B" }}>Pickup</div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#0F172A",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {profile.data.pickupLocation?.address ||
                    profile.data.homeLocation?.address ||
                    "Not set"}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLocationToSet("pickup");
                }}
                style={{
                  padding: "4px 8px",
                  background: "#16C15D",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "10px",
                  fontWeight: "600",
                }}
              >
                SET
              </button>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px",
                background: "#EFF6FF",
                borderRadius: "10px",
                cursor: "pointer",
                transition: "all 0.2s",
                border: "2px solid transparent",
              }}
              onClick={() => setLocationToSet("drop")}
            >
              <MapPin size={14} color="#3B82F6" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "10px", color: "#64748B" }}>Drop</div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#0F172A",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {profile.data.dropLocation?.address || "Not set"}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLocationToSet("drop");
                }}
                style={{
                  padding: "4px 8px",
                  background: "#3B82F6",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "10px",
                  fontWeight: "600",
                }}
              >
                SET
              </button>
            </div>
            {upcomingTrip?.driverId && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px",
                  background: "#F8FAFC",
                  borderRadius: "10px",
                }}
              >
                <User size={14} color="#64748B" />
                <div>
                  <div style={{ fontSize: "10px", color: "#64748B" }}>
                    Driver
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#0F172A",
                    }}
                  >
                    {upcomingTrip.driverId?.name || "Driver"}
                    {upcomingTrip.driverId?.vehicleNumber && (
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#64748B",
                          marginLeft: "6px",
                        }}
                      >
                        {upcomingTrip.driverId.vehicleNumber}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : profile.error ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px",
              color: "#EF4444",
              fontSize: "12px",
            }}
          >
            <AlertCircle size={14} /> Failed to load profile
          </div>
        ) : (
          <p
            style={{
              textAlign: "center",
              padding: "16px",
              color: "#64748B",
              fontSize: "12px",
            }}
          >
            Loading...
          </p>
        )}
      </div>

      {/* Next Trip Schedule */}
      <div
        style={{
          background: "#FFF",
          borderRadius: "14px",
          padding: "16px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          marginBottom: "16px",
        }}
      >
        <h3
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "#0F172A",
            marginBottom: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Clock size={16} /> Next Trip
        </h3>
        {upcomingTrip ? (
          <div
            style={{
              background: "#F0FDF4",
              borderRadius: "10px",
              padding: "12px",
              border: "1px solid #16C15D33",
            }}
          >
            <div
              style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}
            >
              {upcomingTrip.routeName ||
                upcomingTrip.routeId?.name ||
                "Assigned Trip"}
            </div>
            <div
              style={{ fontSize: "11px", color: "#64748B", marginTop: "4px" }}
            >
              {upcomingTrip.scheduledAt
                ? new Date(upcomingTrip.scheduledAt).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Schedule pending"}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <span style={{ fontSize: "11px", color: "#64748B" }}>
                📍{" "}
                {upcomingTrip.myEntry?.pickupStop?.stopName ||
                  profile.data?.pickupLocation?.address ||
                  "-"}
              </span>
              <span style={{ fontSize: "11px", color: "#64748B" }}>
                →{" "}
                {upcomingTrip.myEntry?.dropStop?.stopName ||
                  profile.data?.dropLocation?.address ||
                  "-"}
              </span>
            </div>
          </div>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "20px",
              color: "#64748B",
              fontSize: "12px",
            }}
          >
            No upcoming trips scheduled
          </div>
        )}
      </div>

      {/* Recent Trips */}
      <div
        style={{
          background: "#FFF",
          borderRadius: "14px",
          padding: "16px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A" }}>
            Recent Trips
          </h3>
          <Link
            href="/customer/my-trips"
            style={{
              fontSize: "11px",
              color: "#16C15D",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            View All →
          </Link>
        </div>
        {trips.data && trips.data.length > 0 ? (
          trips.data.slice(0, 3).map((trip: any, i: number) => (
            <div
              key={trip._id || i}
              style={{
                padding: "10px 0",
                borderBottom: i < 2 ? "1px solid #F1F5F9" : "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#0F172A",
                  }}
                >
                  {trip.routeId?.name || trip.routeName || "Trip"}
                </span>
                <span
                  style={{
                    fontSize: "9px",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background:
                      trip.status === "COMPLETED"
                        ? "#DCFCE7"
                        : trip.status === "SCHEDULED" ||
                            trip.status === "IN_PROGRESS"
                          ? "#DBEAFE"
                          : "#FEF3C7",
                    color:
                      trip.status === "COMPLETED"
                        ? "#16C15D"
                        : trip.status === "SCHEDULED" ||
                            trip.status === "IN_PROGRESS"
                          ? "#2563EB"
                          : "#F59E0B",
                  }}
                >
                  {trip.status}
                </span>
              </div>
              <span style={{ fontSize: "10px", color: "#64748B" }}>
                {trip.tripDate
                  ? new Date(trip.tripDate).toLocaleDateString("en-IN")
                  : "-"}
              </span>
            </div>
          ))
        ) : trips.isLoading ? (
          <p
            style={{
              textAlign: "center",
              padding: "16px",
              color: "#64748B",
              fontSize: "12px",
            }}
          >
            Loading trips...
          </p>
        ) : (
          <p
            style={{
              textAlign: "center",
              padding: "16px",
              color: "#64748B",
              fontSize: "12px",
            }}
          >
            No trips yet
          </p>
        )}
      </div>

      {locationToSet && (
        <LocationSelector
          type={locationToSet}
          initialAddress={
            locationToSet === "pickup"
              ? profile.data?.pickupLocation?.address || profile.data?.homeLocation?.address
              : profile.data?.dropLocation?.address
          }
          initialCoordinates={
            locationToSet === "pickup"
              ? (profile.data?.pickupLocation?.coordinates as number[]) || (profile.data?.homeLocation?.coordinates as number[])
              : (profile.data?.dropLocation?.coordinates as number[])
          }
          onLocationSelect={(location) => {
            updateLocationMutation.mutate({
              field: locationToSet === "pickup" ? "pickupLocation" : "dropLocation",
              value: { address: location.address, coordinates: location.coordinates },
            });
          }}
          onCancel={() => setLocationToSet(null)}
        />
      )}
    </div>
  );
}
