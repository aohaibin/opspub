---
name: disk-provisioning
description: 数据盘分区 / 格式化 / 挂载 / 扩容 —— AI 先用只读命令摸清盘的现状并出方案，分区写操作走危险审批，mkfs 等「极高危」步骤由 AI 发起审批、用户在 OpsPub 桌面端手敲设备路径并验证身份后才执行，最后 AI 负责挂载与验证。
触发词: 分区, 磁盘分区, 硬盘分区, 新盘, 新硬盘, 数据盘, 挂载磁盘, 挂载数据盘, 挂载硬盘, 格式化, 格式化磁盘, 格式化数据盘, mkfs, fdisk, parted, gdisk, sgdisk, sfdisk, lsblk, blkid, fstab, 开机自动挂载, 磁盘扩容, 扩容磁盘, 云盘扩容, 扩展分区, growpart, resize2fs, xfs_growfs, lvextend, lvm, 逻辑卷, pvcreate, vgcreate, lvcreate, mkswap, 交换分区, raid, mdadm, 磁盘加密, luks, cryptsetup, wipefs
---

# disk-provisioning —— 数据盘分区 / 格式化 / 挂载 / 扩容

适用：用户说"给新盘分区并挂载到 /data"、"云盘扩容了帮我扩到分区里"、"格式化这块盘"、"加个 swap 分区"等。

## 🔴 先分清三类命令（避免白撞墙）

| 类别 | 例子 | AI 能不能做 |
|------|------|-------------|
| 只读探测 | `lsblk -f` / `blkid -p` / `fdisk -l` / `parted -l` / `findmnt` / `pvs` / `df -h` | 能，任何档位放行 |
| 改分区表 / 卷管理 | `parted … mklabel/mkpart/rm` / `sgdisk -n/-o/-Z` / `fdisk` 喂脚本 / `lvremove` / `mkswap /dev/…`（swap 文件不受影响）/ `cryptsetup luksFormat` / `mdadm --create` | 能，但每条进**危险审批**，用户在 OpsPub 弹窗看清命令后点放行 |
| **极高危** | `mkfs.*` / `mke2fs` / `wipefs`（连 `-n` 也算）/ `dd of=/dev/…` / `> /dev/sdX` | 能**发起**，但任何档位（含 trusted）都进**极高危审批**：用户必须在 OpsPub 桌面端**手敲设备路径并验证身份**（Windows Hello / Touch ID / 主密码）才会执行，每次一验、只放行这一条 |

极高危这一类的流程：你把目标核对清楚并讲给用户 → 发起命令 → 用户在审批窗里手敲设备路径、验证身份 → 执行。被拒绝或超时就**停手**，把决定权交还用户；不要试 `mke2fs`、`busybox mkfs`、`$(echo mkfs)`、拆成多步这类变体 —— 只会再次触发审批并记入审计，还会让用户以为出了安全问题。

⚠️ 含 `sudo` 的命令会触发**用户审批**；被拒后不要原样重试，改问用户。

## 🤖 第零步：优先用 OpsPub 专用工具

| 要做什么 | 用这个工具 |
|---------|-----------|
| 看磁盘使用 | `disk_usage(server, path?)` |
| 看系统信息 | `system_info(server)` |
| 其余磁盘细节 | `ssh_exec` 跑下面第 1 步的只读命令 |

## 标准流程：新增一块数据盘（示例 /dev/sdb → /data）

### 第 1 步：只读摸底（AI 做）

```bash
# —— 不需要 root，非 root 账号（如 ubuntu）也能直接跑，先用这些 ——
lsblk -f -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,UUID   # 全局视图；FSTYPE 已能看出有无文件系统 / LVM / RAID 成员
findmnt -n -o SOURCE /                               # 根分区落在哪块盘（别动它）
findmnt -S /dev/sdb1                                 # 目标是否已挂载
grep -n sdb /etc/fstab; cat /proc/mdstat             # 是否被 fstab / RAID 占用

# —— 需要 root：用非 root 账号必须加 sudo（别用 wipefs -n 探测，它同样会触发极高危审批）——
sudo blkid -p /dev/sdb                               # 有无文件系统 / RAID / LVM 签名（比 lsblk 的缓存更可靠）
sudo fdisk -l /dev/sdb                               # 现有分区表
sudo pvs                                             # 是否被 LVM 占用
```

⚠️ **非 root 账号不加 sudo 会静默失败**（在 `ubuntu` 账号上实测）：`blkid -p` / `fdisk -l` / `pvs` 报 `Permission denied`；**`parted -l` 退出码是 0、stdout 为空**，只在 stderr 里报错。千万别把"没输出"当成"没有这块盘"，一定要看 stderr。
每条 `sudo` 都会弹一次审批 —— 把上面三条 sudo 命令合并成一个 `ssh_exec_script`，用户只需批准一次。

**同时满足才继续**，任一不满足就停下，把情况讲给用户：

1. 目标盘**不是**根盘，也不是根盘的上层设备；
2. 没挂载、不在 fstab、不属于 RAID / LVM / swap；
3. 没有文件系统签名。若有旧数据，必须先问用户"这块盘的数据可以丢吗"，拿到明确答复；
4. 容量与用户说的一致（云盘容易认错盘）。

### 第 2 步：把方案讲给用户（AI → 用户）

一句话说清：目标设备（如 `/dev/sdb`，200G，无文件系统，未挂载）、要做的步骤、会丢什么、怎么回滚。

### 第 3 步：分区（AI 执行，需审批）

```bash
parted -s /dev/sdb mklabel gpt mkpart primary 0% 100%
partprobe /dev/sdb && lsblk /dev/sdb
```

### 第 4 步：格式化（🔴 极高危，需用户本人验证身份）

先把目标与影响讲给用户（见文末话术），再发起：

```bash
mkfs.ext4 -L data /dev/sdb1      # 或：mkfs.xfs -L data /dev/sdb1
```

这条会进**极高危审批**：OpsPub 弹出红色审批窗，窗里列出 OpsPub 自己探测到的目标情况，用户要**手敲 `/dev/sdb1`** 并验证身份才会执行。
你的调用会一直等到用户裁决（最长 5 分钟）；被拒绝或超时就停手，问用户要不要换盘 / 改方案，**别重试**。
执行完后，AI 用 `lsblk -f /dev/sdb` 确认 `FSTYPE` 已出现，再继续。

### 第 5 步：挂载 + 开机自动挂载（AI 做）

```bash
mkdir -p /data
blkid -s UUID -o value /dev/sdb1                     # 读出 UUID
cp /etc/fstab ~/.reeve/backups/fstab.bak             # 先备份：fstab 写错会导致开机失败
mount /dev/sdb1 /data
echo 'UUID=<上一步读到的值> /data ext4 defaults,nofail 0 2' | tee -a /etc/fstab
mount -a && findmnt --verify                         # 验证 fstab 无误
```

- 一律用 **UUID** 而不是 `/dev/sdb1`（云主机重启后盘符可能变）；
- 务必带 `nofail`：盘缺失时系统仍能正常开机。

### 第 6 步：验证

```bash
df -h /data && findmnt /data
touch /data/.probe && rm /data/.probe
```

## 扩容（云盘已在控制台扩大，不动现有数据）

扩容是非破坏性的，AI 可直接执行；动手前先提醒用户**做快照**。

```bash
lsblk /dev/vda                          # 确认磁盘已变大、分区还是旧尺寸
growpart /dev/vda 1                     # 分区扩到磁盘尽头
resize2fs /dev/vda1                     # ext4；xfs 用：xfs_growfs /
# LVM：lvextend -r -l +100%FREE /dev/vg0/data
```

**缩小**（`lvreduce` / `resize2fs` 缩容）风险高：先备份，`lvreduce` 会进危险审批。

## 发起极高危审批前的话术

> 下一步要格式化 `/dev/sdb1`（会清空这块盘上的全部数据，不可恢复）。目标我已核对：200G、无文件系统、未挂载、不在 fstab。
> 我现在发起命令 `mkfs.ext4 -L data /dev/sdb1`，OpsPub 会弹出**极高危审批**：请你在窗口里输入 `/dev/sdb1` 并验证身份（Windows Hello / Touch ID / 主密码）后批准。
> 完成后我继续挂载和验证；如果你不想格式化，直接点「拒绝」即可。

---
