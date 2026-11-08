import { invoke } from "./client";

export interface DeviceNetworkInterface {
  name: string;
  address: string;
  recommended: boolean;
}

export interface DeviceChannelStatus {
  running: boolean;
  pairing: boolean;
  persistent: boolean;
  host: string | null;
  port: number | null;
  baseUrl: string | null;
  pairedDeviceId: string | null;
}

export interface PhonePairingSession {
  sessionId: string;
  baseUrl: string;
  pairingUrl: string;
  expiresAt: number;
}

export interface PairedDevice {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number | null;
}

export const deviceChannelApi = {
  listInterfaces: () => invoke<DeviceNetworkInterface[]>("list_device_network_interfaces"),
  createPairingSession: (address: string) =>
    invoke<PhonePairingSession>("create_phone_pairing_session", { address }),
  start: (address: string) =>
    invoke<DeviceChannelStatus>("start_device_channel", { address }),
  stop: () => invoke<void>("stop_device_channel"),
  status: () => invoke<DeviceChannelStatus>("get_device_channel_status"),
  listDevices: () => invoke<PairedDevice[]>("list_paired_devices"),
  revokeDevice: (id: string) => invoke<void>("revoke_paired_device", { id }),
  cancelPairing: (sessionId: string) => invoke<void>("cancel_phone_pairing_session", { sessionId }),
};
