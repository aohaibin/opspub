import { useEffect, useState } from "react";
import { Alert, Button, Modal, QRCode, Radio, Select, Tag, message } from "antd";
import { CheckCircle2, Clock, Copy, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import { deviceChannelApi, getErrorMessage } from "@/lib/api";
import type { DeviceChannelStatus, DeviceNetworkInterface, PairedDevice, PhonePairingSession } from "@/lib/api/device-channel";
import { useSettingsStore } from "@/store/settings";

const stopped: DeviceChannelStatus = { running: false, pairing: false, persistent: false, host: null, port: null, baseUrl: null, pairedDeviceId: null };
function useCopy() {
  const language = useSettingsStore((state) => state.language);
  return (zh: string, en: string) => language === "en-US" ? en : zh;
}

export function MobilePairingSettings() {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const [interfaces, setInterfaces] = useState<DeviceNetworkInterface[]>([]);
  const [address, setAddress] = useState("");
  const [session, setSession] = useState<PhonePairingSession | null>(null);
  const [seconds, setSeconds] = useState(120);
  const [paired, setPaired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<PairedDevice[]>([]);

  useEffect(() => {
    let mounted = true;
    const refresh = () => { void deviceChannelApi.listDevices().then((values) => { if (mounted) setDevices(values); }).catch(() => undefined); };
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!session || paired) return;
    let mounted = true;
    const update = () => {
      setSeconds(Math.max(0, session.expiresAt - Math.floor(Date.now() / 1000)));
      void deviceChannelApi.status().then((status) => {
        if (!mounted) return;
        if (status.pairedDeviceId) {
          setPaired(true);
          void deviceChannelApi.listDevices().then((values) => { if (mounted) setDevices(values); }).catch(() => undefined);
        }
      }).catch(() => undefined);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [session, paired]);

  async function show() {
    setBusy(true);
    try {
      const [values, status] = await Promise.all([deviceChannelApi.listInterfaces(), deviceChannelApi.status()]);
      setInterfaces(values);
      setAddress(status.host ?? values.find((item) => item.recommended)?.address ?? values[0]?.address ?? "");
      setOpen(true);
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setBusy(false); }
  }
  async function create() {
    setBusy(true);
    try {
      const value = await deviceChannelApi.createPairingSession(address);
      setSession(value); setPaired(false); setSeconds(120);
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setBusy(false); }
  }
  async function cancel(close: boolean) {
    setBusy(true);
    try {
      if (session) await deviceChannelApi.cancelPairing(session.sessionId);
      setSession(null); setPaired(false);
      if (close) setOpen(false);
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setBusy(false); }
  }
  async function enableChannel() {
    setBusy(true);
    try {
      await deviceChannelApi.start(address);
      if (session) await deviceChannelApi.cancelPairing(session.sessionId);
      setSession(null); setPaired(false); setOpen(false);
      message.success(copy("设备通道已开启，手机可以继续使用", "Channel started. Your phone can now connect."));
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setBusy(false); }
  }
  function revoke(device: PairedDevice) {
    Modal.confirm({
      title: copy("解除设备配对？", "Unpair this device?"),
      content: copy(`“${device.name}”将立即失去访问权限，需要重新扫码才能连接。`, `“${device.name}” will lose access immediately and must pair again.`),
      okText: copy("解除配对", "Unpair"), cancelText: copy("取消", "Cancel"), okButtonProps: { danger: true },
      onOk: async () => {
        try { await deviceChannelApi.revokeDevice(device.id); setDevices(await deviceChannelApi.listDevices()); }
        catch (error) { message.error(getErrorMessage(error)); throw error; }
      },
    });
  }

  return <div className="space-y-4 text-[13px]">
    <Button type="primary" loading={busy && !open} onClick={() => void show()}>{copy("生成配对二维码", "Generate pairing QR")}</Button>
    {devices.length > 0 && <div className="space-y-2 border-t border-slate-800/80 pt-4">
      <div className="mb-2 font-medium text-slate-300">{copy("已配对设备", "Paired devices")} <span className="text-slate-500">({devices.length})</span></div>
      {devices.map((device) => <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-surface-950/40 p-3">
        <div className="flex min-w-0 items-center gap-3"><Smartphone size={20} className="shrink-0 text-indigo-400" /><div className="min-w-0"><div className="break-all font-medium text-slate-200">{device.name}</div><div className="mt-1 text-xs text-slate-500">{copy("配对于", "Paired")} {new Date(device.createdAt * 1000).toLocaleString()}{device.lastSeenAt && <> · {copy("最近访问", "Last seen")} {new Date(device.lastSeenAt * 1000).toLocaleString()}</>}</div></div></div>
        <Button danger size="small" icon={<Trash2 size={13} />} onClick={() => revoke(device)}>{copy("解除配对", "Unpair")}</Button>
      </div>)}
    </div>}
    <Modal open={open} title={<span className="text-base font-semibold">{copy("配对手机", "Pair your phone")}</span>} onCancel={() => { if (!busy) void cancel(true); }} footer={null} width={480} maskClosable={false} styles={{ body: { maxHeight: "calc(100dvh - 220px)", overflowY: "auto", paddingTop: 12 } }}>
      {paired ? <div className="space-y-4 py-3 text-center"><CheckCircle2 className="mx-auto text-emerald-400" size={48} /><h3 className="text-base font-medium">{copy("手机配对成功", "Phone paired successfully")}</h3><p className="text-sm leading-6 text-slate-400">{copy("设备授权已保存，重启软件后无需重复扫码。开启设备通道后，手机即可进行审批、应急锁定、AI 对话和知识库查询。", "Pairing is saved across restarts. Start the device channel to use approvals, emergency locking, AI chat, and knowledge search.")}</p><Button block type="primary" loading={busy} onClick={() => void enableChannel()}>{copy("开启通道并完成", "Start channel and finish")}</Button></div>
      : !session ? <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-400">{copy("选择手机与电脑共用的私网网卡。请连接同一个 Wi-Fi，再生成配对码。", "Choose the private adapter shared with your phone. Connect both devices to the same Wi-Fi first.")}</p>
        <div className="max-h-56 space-y-2 overflow-y-auto">{interfaces.map((item) => <label key={item.address} className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border p-3 ${address === item.address ? "border-indigo-500/60 bg-indigo-500/10" : "border-slate-800 bg-surface-950/40"}`}>
          <div className="flex min-w-0 items-center gap-3"><Radio checked={address === item.address} onChange={() => setAddress(item.address)} /><div className="min-w-0"><div className="truncate text-sm font-medium text-slate-200">{item.name}</div><div className="mt-1 font-mono text-xs text-slate-400">{item.address}</div></div></div>{item.recommended && <Tag color="blue" className="!m-0">{copy("建议", "Recommended")}</Tag>}
        </label>)}{interfaces.length === 0 && <Alert type="warning" showIcon message={copy("未检测到私网 IPv4 网卡，请先连接 Wi-Fi 或有线网络。", "No private IPv4 adapter found. Connect to Wi-Fi or Ethernet first.")} />}</div>
        <Alert type="info" showIcon description={copy("配对码只能使用一次，120 秒后失效。临时配对服务仅监听所选私网地址。", "The QR code is single-use and expires after 120 seconds. Pairing only listens on the selected private address.")} />
        <Button block type="primary" loading={busy} disabled={!address} onClick={() => void create()}>{copy("生成配对二维码", "Generate pairing QR")}</Button>
      </div> : <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm leading-6 text-slate-400">{copy("使用手机相机扫码，在浏览器中输入设备名称并确认配对。请勿分享二维码。", "Scan with your phone camera, enter a device name in the browser, and confirm pairing. Keep this code private.")}</p>
        <div className="rounded-xl bg-white p-3"><QRCode value={session.pairingUrl} color="#111827" bgColor="#ffffff" size={220} bordered={false} status={seconds === 0 ? "expired" : "active"} onRefresh={() => void create()} /></div>
        <div className="flex items-center gap-2 text-sm text-slate-400"><Clock size={15} />{seconds > 0 ? <>{copy("有效时间", "Expires in")} <b className="font-mono text-amber-400">{seconds}s</b></> : copy("配对码已过期，请刷新", "Code expired. Please refresh.")}</div>
        <div className="w-full break-all rounded-lg bg-surface-950/50 p-3 font-mono text-xs text-slate-400">{session.baseUrl}</div>
        <div className="flex w-full gap-3"><Button className="flex-1" disabled={busy} onClick={() => void cancel(false)}>{copy("重新选择网卡", "Change adapter")}</Button><Button className="flex-1" type="primary" loading={busy} onClick={() => void create()}>{copy("刷新配对码", "Refresh code")}</Button></div>
      </div>}
    </Modal>
  </div>;
}

export function DeviceChannelSettings() {
  const copy = useCopy();
  const [interfaces, setInterfaces] = useState<DeviceNetworkInterface[]>([]);
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<DeviceChannelStatus>(stopped);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  async function refresh() {
    try {
      const [values, current] = await Promise.all([deviceChannelApi.listInterfaces(), deviceChannelApi.status()]);
      setInterfaces(values); setStatus(current); setLoadError("");
      setAddress((previous) => current.host ?? (values.some((item) => item.address === previous) ? previous : values.find((item) => item.recommended)?.address ?? values[0]?.address ?? ""));
    } catch (error) { setLoadError(getErrorMessage(error)); }
  }
  useEffect(() => {
    void refresh();
    let mounted = true;
    const timer = window.setInterval(() => { void deviceChannelApi.status().then((value) => { if (mounted) { setStatus(value); if (value.host) setAddress(value.host); } }).catch(() => undefined); }, 2000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);
  async function toggle() {
    setBusy(true);
    try {
      if (status.persistent) { await deviceChannelApi.stop(); setStatus(stopped); }
      else { setStatus(await deviceChannelApi.start(address)); }
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setBusy(false); }
  }
  async function copyAddress() {
    if (!status.baseUrl) return;
    try { await navigator.clipboard.writeText(status.baseUrl); message.success(copy("通道地址已复制", "Channel URL copied")); }
    catch (error) { message.error(getErrorMessage(error)); }
  }
  return <div className="space-y-3.5 text-[13px]">
    <div className="flex items-center gap-2"><Tag className="!m-0" color={status.persistent ? "green" : status.pairing ? "blue" : "default"}>{status.persistent ? copy("运行中", "Running") : status.pairing ? copy("临时配对中", "Pairing") : copy("未开启", "Stopped")}</Tag><span className="text-xs text-slate-500">{copy("配对记录保留，退出软件后通道关闭", "Pairing is saved; the channel closes when the app exits")}</span></div>
    <Alert type="info" showIcon description={copy("只在手机与这台电脑连同一个 Wi-Fi 时可用。OpsPub 不内置组网能力，不支持跨网络访问。请仅在可信局域网使用。", "Both devices must use the same Wi-Fi. OpsPub does not include mesh networking or cross-network access. Use a trusted LAN.")} />
    {loadError && <Alert type="error" showIcon message={loadError} />}
    <div className="flex flex-wrap items-center gap-3 pt-1"><Select className="w-full sm:w-[300px]" disabled={status.running} value={address || undefined} onChange={setAddress} placeholder={copy("选择私网网卡", "Choose a private adapter")} options={interfaces.map((item) => ({ value: item.address, label: `${item.name} — ${item.address}` }))} /><Button type={status.persistent ? "default" : "primary"} danger={status.persistent} loading={busy} disabled={!status.persistent && !address} onClick={() => void toggle()}>{status.persistent ? copy("关闭通道", "Stop channel") : copy("开启通道", "Start channel")}</Button><Button type="text" aria-label={copy("刷新网卡", "Refresh adapters")} icon={<RefreshCw size={14} />} disabled={status.running} onClick={() => void refresh()} /></div>
    {status.running && status.baseUrl && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300"><div className="flex items-center gap-2"><CheckCircle2 size={16} className="shrink-0" /><span>{copy("手机访问地址", "Mobile URL")}: <span className="break-all font-mono">{status.baseUrl}</span></span></div><Button size="small" icon={<Copy size={13} />} onClick={() => void copyAddress()}>{copy("复制", "Copy")}</Button></div>}
    <p className="mb-0 text-xs leading-6 text-slate-500">{copy("扫码配对后，手机浏览器可查看审批并批准或驳回、紧急锁定 AI 操作、发起 AI 对话和查询内置技能知识库。所有操作沿用电脑端策略与审计；关闭通道不解除设备配对。", "After pairing, your phone browser can review approvals, lock AI operations, chat with AI, and search built-in skill knowledge. Desktop policies and auditing still apply. Stopping the channel keeps devices paired.")}</p>
  </div>;
}
