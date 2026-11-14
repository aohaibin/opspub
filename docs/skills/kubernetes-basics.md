---
name: kubernetes-basics
description: Kubernetes 运维基础速查 —— kubectl 高频 / helm / 调试 / 资源 yaml / namespace / context。
触发词: kubernetes, k8s, kubectl, helm, kubelet, pod, deployment, namespace, ingress, service, configmap, secret, kube-system, k3s, k0s, kubeadm, k8s 起不来, pod 起不来, crashloopbackoff, imagepullbackoff, oomkilled, pending pod, evicted, node not ready, ingress 不通, svc 不通, dns 解析失败, coredns, kubeconfig, k8s 节点, k8s 集群, helm 装, helm 卸载, kubectl 描述, kubectl describe, kubectl logs, kubectl exec, pv pvc, storage class, hpa, daemonset, statefulset
dangerous_commands:
  - '(?i)\bkubectl\s+delete\s+(?:namespace|ns)\b[^\n]*(?:kube-system|kube-public|default|production|prod)\b'
  - '(?i)\bkubectl\s+delete\s+(?:--all-namespaces|-A)\s+(?:--all|--force)\b'
  - '(?i)\bkubectl\s+delete\s+(?:pod|po)\b[^\n]*--grace-period\s*=\s*0\b[^\n]*--force\b'
  - '(?i)\bkubectl\s+drain\b[^\n]*--delete-emptydir-data\b[^\n]*--force\b'
  - '(?i)\bhelm\s+uninstall\b[^\n]*(?:--namespace\s+(?:production|prod|kube-system)|-n\s+(?:production|prod|kube-system))'
  - '(?:^|[\s;&|])kubeadm\s+reset\b'
  # 删 etcd 数据目录 = 整集群状态丢失，无快照不可恢复（正文路径表 + 危险清单对应项）
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+/var/lib/etcd(?:\s|/|$)'
---

# kubernetes-basics —— K8s 运维基础

适用：用户报"pod 起不来"/"deployment 不滚动"/"service 访问不到"/"helm 装的 chart 怎么改"/"k3s 节点没注册上"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看 kubelet/containerd/k3s 是否在跑** → `service_status(server, "kubelet")` / `service_status(server, "k3s")`（任何档位放行，比 `ssh_exec systemctl status` 稳）。
- **看 NodePort 是否被监听** → `port_check(server, 30080)`。
- **看节点磁盘**（kubelet 因磁盘压力 evict pod 很常见）→ `disk_usage(server, "/var/lib")`。
- **编辑 manifest / kubeconfig** → `sftp_read` 看现状 + `sftp_write` 整文件写（无 shell heredoc 转义坑），写完 `ssh_exec kubectl apply -f`。
- ⚠️ `kubectl get/describe/logs` 是只读判定；但 `kubectl delete` / `drain` / `apply` / `rollout` / `helm install|uninstall` 是写操作，会触发**用户审批**——提前告知用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试，改只读探查或询问用户。
- 注：kubectl 命令本身一般不需 `sudo`（凭 kubeconfig 鉴权），但删 namespace/pod、drain 节点等仍受策略档位约束。

## 第一步：kubectl context

```bash
kubectl config view                                # 看所有 context
kubectl config get-contexts
kubectl config current-context
kubectl config use-context <name>                  # 切 context
kubectl config set-context --current --namespace=mynamespace   # 当前 ctx 默认 ns

# kubeconfig 文件位置
echo $KUBECONFIG                                   # 多个用 ":" 分隔
ls ~/.kube/config
```

> ⚠️ **生产/预发/测试不同 cluster 用不同 KUBECONFIG**；混在一个 config 容易切错。

## 第二步：常用查询

```bash
kubectl get pod                                    # 当前 ns
kubectl get pod -A                                 # 所有 ns
kubectl get pod -o wide                            # 含节点 IP
kubectl get pod -l app=myapp                       # label selector
kubectl get pod --field-selector status.phase=Running
kubectl get pod -w                                 # watch

# 多资源类型
kubectl get all                                    # pod + svc + deploy + rs (当前 ns)
kubectl get all,ingress,configmap,secret -A

# yaml / json
kubectl get pod mypod -o yaml
kubectl get pod mypod -o jsonpath='{.status.podIP}'

# 排序
kubectl get pod --sort-by=.metadata.creationTimestamp
kubectl get pod --sort-by=.status.containerStatuses[0].restartCount
```

## 第三步：调试

```bash
kubectl describe pod mypod                         # 事件 + 状态详细
kubectl logs mypod                                 # 主容器
kubectl logs mypod -c sidecar                      # 多容器
kubectl logs mypod --previous                      # 上一次容器（OOMKilled 后看这）
kubectl logs -f --tail=200 mypod
kubectl logs -l app=myapp --max-log-requests=10    # label 选

kubectl exec -it mypod -- sh                       # 进容器
kubectl exec -it mypod -c sidecar -- sh
kubectl exec mypod -- ls /app

kubectl port-forward pod/mypod 8080:8080           # 本地访问 pod 端口
kubectl port-forward svc/mysvc 8080:80             # 通过 service
kubectl port-forward -n monitoring svc/grafana 3000

kubectl cp mypod:/path/file ./file                 # 文件拷出
kubectl cp ./file mypod:/path/

kubectl top pod                                    # 资源用量（需 metrics-server）
kubectl top node
```

`kubectl describe` **是排障最重要的命令** —— 底部 Events 段会列出近期所有调度 / 拉镜像 / 启动事件。

## 第四步：事件 + 节点

```bash
kubectl get events --sort-by='.lastTimestamp' -A | tail -50
kubectl get events --field-selector type=Warning

kubectl get node
kubectl describe node <node>                       # 节点详情：容量 / 已分配 / 条件
kubectl get node -o wide                           # IP / 内核版本
```

## 第五步：常见 pod 故障

| 状态 | 原因 | 排查 |
|------|------|------|
| `Pending` | 没节点能调度 / 资源不足 / PVC 没就绪 | `describe pod` 看 Events |
| `ContainerCreating` | 拉镜像中 / volume 挂载中 | 等；超 5 分钟看 `describe` |
| `ImagePullBackOff` | 镜像拉不下来 | 私库认证 / 网络 / 镜像名错 |
| `CrashLoopBackOff` | 容器启动后立刻挂 | `logs --previous` |
| `Running` 但 `0/1 Ready` | readinessProbe 失败 | `describe` 看 probe 配置 |
| `Terminating` 卡住 | finalizer / volume 卸载失败 | `kubectl patch pod xxx -p '{"metadata":{"finalizers":null}}'`（**最后手段**） |
| `OOMKilled` | 容器内存超 limits | 调大 limits / 修内存泄漏 |
| `Error` (137) | OOM | 同上 |
| `Error` (143) | SIGTERM 优雅退出失败 | 应用 graceful shutdown 加超时 |

## 第六步：deployment / rollout

```bash
kubectl get deploy
kubectl rollout status deploy/myapp
kubectl rollout history deploy/myapp
kubectl rollout undo deploy/myapp                  # 回滚到上一版
kubectl rollout undo deploy/myapp --to-revision=3  # 回到特定版本
kubectl rollout restart deploy/myapp               # 强制滚动（image 没变也能）

# 改 image
kubectl set image deploy/myapp app=myrepo/myapp:v2

# 扩缩
kubectl scale deploy/myapp --replicas=5
kubectl autoscale deploy/myapp --min=2 --max=10 --cpu-percent=80
```

## 第七步：service / ingress

```bash
kubectl get svc
kubectl get ingress

# 测连通
kubectl run debug --rm -it --image=nicolaka/netshoot -- bash
# 进 debug pod 后
curl mysvc.default.svc.cluster.local
curl mysvc.default.svc.cluster.local:80/health
nslookup mysvc.default.svc.cluster.local
```

service 类型：

| Type | 用途 |
|------|------|
| `ClusterIP` | 集群内访问（默认） |
| `NodePort` | 在每节点开 30000-32767 端口对外 |
| `LoadBalancer` | 云厂商 LB / metallb（裸金属） |
| `ExternalName` | DNS CNAME 别名 |

## 第八步：yaml 编辑套路

```bash
kubectl edit deploy/myapp                          # 直接改（变更立即生效）
kubectl apply -f myapp.yaml                        # 声明式更新
kubectl apply -f https://raw.githubusercontent.com/.../manifests/install.yaml
kubectl delete -f myapp.yaml
kubectl diff -f myapp.yaml                         # 看会改什么（不执行）

# 导出现有资源为模板
kubectl get deploy myapp -o yaml > myapp.yaml
# 干净版本（去掉 status / metadata 噪声）
kubectl get deploy myapp -o yaml --show-managed-fields=false \
    | yq 'del(.status, .metadata.uid, .metadata.resourceVersion, .metadata.creationTimestamp)' > myapp.yaml
```

## 第九步：helm

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
helm search repo bitnami/redis
helm show values bitnami/redis > values.yaml          # 看可调参数

helm install myredis bitnami/redis -f values.yaml --namespace data --create-namespace
helm upgrade myredis bitnami/redis -f values.yaml
helm rollback myredis 1                                # 回滚到 release rev 1
helm uninstall myredis -n data                         # ⚠️ 删，含 PVC（按 chart 设计）
helm list -A
helm history myredis -n data
helm get values myredis -n data                        # 当前 release 的 values
helm get manifest myredis -n data                      # 渲染后的 yaml
```

**注意**：`helm uninstall` 默认**不删 PVC**（Bitnami 等 chart 设了 `persistence.existingClaim` 或 `keep` 注解保护）；删 PVC 要单独 `kubectl delete pvc -n data -l app.kubernetes.io/instance=myredis`。

## 第十步：常用资源 yaml 速查

### Pod（最小）

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mypod
spec:
  containers:
    - name: app
      image: nginx:1.25
      resources:
        requests: { cpu: 100m, memory: 128Mi }
        limits:   { cpu: 500m, memory: 512Mi }
      ports:
        - containerPort: 80
```

### Deployment + Service

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: myapp }
spec:
  replicas: 3
  selector: { matchLabels: { app: myapp } }
  template:
    metadata: { labels: { app: myapp } }
    spec:
      containers:
        - name: app
          image: myrepo/myapp:v1
          ports: [{ containerPort: 8080 }]
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            initialDelaySeconds: 10
          readinessProbe:
            httpGet: { path: /ready, port: 8080 }
---
apiVersion: v1
kind: Service
metadata: { name: myapp }
spec:
  selector: { app: myapp }
  ports: [{ port: 80, targetPort: 8080 }]
```

### Secret / ConfigMap

```bash
kubectl create configmap myconfig --from-file=config.yaml --from-literal=key1=value1
kubectl create secret generic mysecret --from-literal=DB_PASS=xxx
# 用 stringData 写明文（yaml）
```

## 第十一步：节点维护

```bash
kubectl cordon node1                               # 标记不可调度（已有 pod 不动）
kubectl drain node1 --ignore-daemonsets --delete-emptydir-data   # 驱逐 pod ⚠️
kubectl uncordon node1                             # 恢复
kubectl delete node node1                          # 从 cluster 移除
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| kubeconfig | `~/.kube/config` 或 `$KUBECONFIG` |
| kubelet 配置 | `/var/lib/kubelet/config.yaml` |
| kubelet 日志 | `journalctl -u kubelet` |
| containerd（默认运行时） | `/etc/containerd/config.toml` |
| k3s 配置 | `/etc/rancher/k3s/config.yaml` |
| k3s 数据 | `/var/lib/rancher/k3s/` |
| etcd 数据 | `/var/lib/etcd/`（kubeadm）/ k3s 内嵌 sqlite |
| 镜像缓存（containerd） | `/var/lib/containerd/` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `kubectl delete ns kube-system` | **集群崩溃**，恢复极难 |
| `kubectl delete ns production` 等业务 ns | 全部业务消失 |
| `kubectl delete pod --grace-period=0 --force` | 不发 SIGTERM 直接强杀（**数据可能丢**） |
| `kubectl drain node --force --delete-emptydir-data` | 强逐 + 删本地数据 |
| `helm uninstall` 生产 release | 删 release + 默认会删大部分资源 |
| `kubeadm reset` | **重置整个节点** kubernetes 配置（master 跑这条 = 集群崩） |
| `kubectl delete pv xxx` (Retain 策略) | PV 删除前如果 reclaimPolicy 是 Delete，会**触发存储后端删数据** |
| `rm -rf /var/lib/etcd` | etcd 数据丢，所有 cluster 状态消失 |

## 教训

- **`describe` 是 80% 排障第一站** —— 比看 logs 更快定位"为什么 pod 起不来"。
- 改 deployment **不要直接 `kubectl edit`**，改 git 里的 yaml + `apply`（GitOps）才能审计追踪。
- `rollout restart` 比 `kubectl delete pod` 优雅得多（按 maxSurge/maxUnavailable 控制）。
- 资源 yaml 缺 `requests/limits` 是事故源：节点 OOM 会按 QoS 优先杀掉 BestEffort 的 pod。
- `helm upgrade --install` 比分别 install/upgrade 省心（幂等）。
- `kubectl port-forward` 长时间放着会被 idle timeout 断；高频用建议起 socat/nc proxy 容器。
- 生产 cluster 一定有备份策略：**etcd 定期快照** + 关键资源 yaml 进 git；没备份 = 没救。

---
