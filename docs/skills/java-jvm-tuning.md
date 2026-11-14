---
name: java-jvm-tuning
description: JVM 调优速查 —— jstack / jmap / jcmd / jstat / GC 日志 / heap dump / arthas。
触发词: java, jvm, gc 日志, oom, outofmemory, heap dump, jstack, jmap, jstat, jcmd, jconsole, jvisualvm, arthas, 内存泄漏, full gc, cms, g1gc, zgc, jit, java 21, java 17, java 11, openjdk, eclipse temurin, graalvm, jvm 调优, 调 jvm 参数, xmx, xms, metaspace, 元空间, java 进程吃内存, java 占 cpu, java 卡顿, java 慢, java 爆内存, 线程死锁, deadlock, springboot 起不来, springboot 挂了, 应用 oom, tomcat, jetty, jar 起不来, java 进程没了
dangerous_commands:
  - '(?i)\bjmap\s+-dump\b[^\n]*-F\b'
  - '(?:^|[\s;&|])(?:kill|killall)\s+-9\s+java\b'
  - '(?:^|[\s;&|])(?:pkill|killall)\s+(?:-9\s+)?java\b'
---

# java-jvm-tuning —— JVM 调优与诊断

适用：用户报"Java 进程内存爆 / CPU 飙 / Full GC 频繁 / OOM"；想"看线程栈"/"dump 堆"/"在线诊断"/"看 GC 日志"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看 Java 服务状态** → `service_status(server, "<app>")`（systemd 托管的 Spring Boot/Tomcat，任何档位放行，比 `ssh_exec systemctl status` 稳）。
- **看 GC 日志 / 应用日志** → `tail_log(server, "/var/log/<app>/gc.log")` / `tail_log(server, "<app>.log")`（任何档位放行；OOM 自动 dump 的 hprof 路径也先用 `sftp_list` 确认大小再决定要不要拉）。
- **看进程占用内存** → `system_info(server)`（含负载/内存概览）+ `disk_usage(server)`（heap dump 几个 G 很容易撑爆磁盘，dump 前先看剩余空间）。
- **查端口** → `port_check(server, 8080)`（Java 应用端口在不在监听）。
- **改 JVM 启动参数（启动脚本 / systemd unit / `JAVA_OPTS` 环境文件）** → `sftp_read` 看现状 + `sftp_write` 整文件写，写完 `ssh_exec sudo systemctl daemon-reload` + 重启。
- ⚠️ `jstack`/`jmap`/`jstat`/`jcmd` 这些诊断命令本身是**只读探测**（不改服务），但仍走 `ssh_exec`（过策略档位）；`jmap -dump`/`jcmd GC.run` 会让 JVM 短暂 STW，含 `sudo` 的重启会触发**用户审批**——提前告知用户"这步会让 JVM 暂停几百毫秒/弹审批"，被拒后不要原样重试。

## 第一步：找到 Java 进程

```bash
jps -lv                                          # 列 Java 进程 + 主类 + JVM args
ps aux --sort=-%cpu | grep java | head           # 按 CPU
ps -o pid,rss,vsz,cmd --sort=-rss -C java        # 按内存
```

## 第二步：jstack（线程栈）

```bash
jstack <pid>                                     # 输出全部线程栈
jstack -l <pid>                                  # 含锁信息
jstack <pid> > stack.txt                          # 保存
```

CPU 高的排查套路：

```bash
# 1) 找 CPU 高的线程 native id
top -H -p <pid>                                  # 看 %CPU 高的子线程 PID（top 显示的是 native TID）
# 2) 转 hex
printf "%x\n" <tid>
# 3) 在 jstack 输出里搜对应 nid=0x<hex>
jstack <pid> | grep -A 30 'nid=0x<hex>'
```

死锁：

```bash
jstack <pid> | grep -A 5 deadlock
# 或
jcmd <pid> Thread.print | grep -A 5 deadlock
```

## 第三步：jmap（堆相关）

```bash
# 堆概览
jmap -heap <pid>                                 # 堆参数 + 各区使用率
jmap -histo:live <pid> | head -30                # 类实例数 + 字节（:live 触发一次 Full GC 看存活对象）
jmap -histo <pid> > histo.txt

# Heap dump（**业务停顿，慎用**）
jmap -dump:format=b,live,file=/tmp/heap.hprof <pid>
# 不带 :live 不触发 GC，但 dump 大且含死对象

# 替代（推荐）：jcmd 风格
jcmd <pid> GC.heap_dump /tmp/heap.hprof
```

分析 hprof：

- **Eclipse MAT**（最佳）：本地 GUI，找泄漏
- **VisualVM**：JDK 自带
- **jhat**（已弃用）

## 第四步：jcmd（现代统一工具，推荐）

```bash
jcmd <pid> help                                  # 所有可用命令

# GC
jcmd <pid> GC.run                                # System.gc() 触发
jcmd <pid> GC.heap_info
jcmd <pid> GC.class_histogram

# Thread
jcmd <pid> Thread.print

# Heap dump
jcmd <pid> GC.heap_dump /tmp/heap.hprof

# JFR（Java Flight Recorder，性能 profiling）
jcmd <pid> JFR.start duration=60s filename=/tmp/recording.jfr
jcmd <pid> JFR.dump filename=/tmp/dump.jfr name=<recording-name>
jcmd <pid> JFR.stop name=<recording-name>

# Native memory tracking（先用 -XX:NativeMemoryTracking=summary 启动）
jcmd <pid> VM.native_memory summary
jcmd <pid> VM.native_memory baseline
jcmd <pid> VM.native_memory summary.diff

# JVM 参数（运行中）
jcmd <pid> VM.flags
jcmd <pid> VM.system_properties
jcmd <pid> VM.command_line
```

## 第五步：jstat（GC 实时）

```bash
# 每 1s 一次，共 10 次
jstat -gc <pid> 1000 10
jstat -gcutil <pid> 1000                         # 百分比版本（**推荐**）

# 关键列（gcutil）：
# S0  S1   E    O    M    CCS  YGC  YGCT FGC  FGCT  GCT
# (Survivor0/1)(Eden)(Old)(Metaspace)(...)
# YGC = young GC 次数；YGCT = young GC 总耗时（秒）
# FGC = full GC 次数；FGCT = full GC 总耗时（秒）

# 持续 Full GC + Old 区接近 100% = 内存泄漏，要 dump
```

## 第六步：GC 日志

启动参数（**生产强烈推荐**开 GC 日志）：

```bash
# Java 8
-XX:+PrintGCDetails -XX:+PrintGCDateStamps -XX:+UseGCLogFileRotation \
    -XX:NumberOfGCLogFiles=5 -XX:GCLogFileSize=100M -Xloggc:/var/log/myapp/gc.log

# Java 9+（unified logging）
-Xlog:gc*:file=/var/log/myapp/gc.log:time,uptime,level,tags:filecount=5,filesize=100M
```

分析工具：

- **GCEasy**（在线 https://gceasy.io，上传 gc.log）
- **GCViewer**（开源 GUI）

## 第七步：常用 JVM 参数

```bash
# 堆大小（生产显式设，别让 JVM 猜）
-Xms4g -Xmx4g                # 初始 = 最大（避免动态扩容停顿）

# 元空间（Java 8+）
-XX:MetaspaceSize=256m -XX:MaxMetaspaceSize=512m

# 直接内存（NIO / Netty）
-XX:MaxDirectMemorySize=1g

# 选 GC（按 JDK 版本和场景）
-XX:+UseG1GC                  # Java 8+ 推荐（balanced）
-XX:+UseZGC                   # Java 17+ 大堆低停顿
-XX:+UseShenandoahGC          # 同上替代
-XX:+UseParallelGC            # 批处理高吞吐

# G1 调优
-XX:MaxGCPauseMillis=200      # 目标停顿
-XX:G1HeapRegionSize=16m

# OOM 时自动 dump
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/var/log/myapp/

# OOM 后执行命令（重启 / 通知）
-XX:OnOutOfMemoryError="kill -9 %p"
```

## 第八步：Arthas（在线诊断神器）

阿里开源，运行时无侵入，适合**线上不能停**的排查。

```bash
# 装
curl -O https://arthas.aliyun.com/arthas-boot.jar
java -jar arthas-boot.jar
# 选要 attach 的 Java 进程编号

# 进入 arthas shell 后：
dashboard                       # 实时 dashboard（CPU / 线程 / 内存）
thread -n 5                     # 最忙 5 个线程
thread <tid>                    # 单线程栈
sc -d com.example.MyClass       # class 详情
sm com.example.MyClass          # 方法列表
jad com.example.MyClass         # 反编译
watch com.example.MyService myMethod '{params, returnObj, throwExp}' -x 3
trace com.example.MyService myMethod    # 方法内调用链耗时
monitor -c 5 com.example.MyService myMethod    # 监控调用统计
profiler start --duration 30                   # async-profiler 集成
profiler stop --file /tmp/profile.html
```

## 第九步：故障速查

### OOM: Java heap space
- Old 区满，存活对象 > 堆
- 行动：heap dump → MAT 找 dominator → 定位泄漏 reference
- 临时缓解：调大 `-Xmx`

### OOM: Metaspace
- 类加载过多（动态生成类、热部署）
- 行动：`-XX:MaxMetaspaceSize=` 调大；查 ClassLoader 泄漏

### OOM: Direct buffer memory
- NIO / Netty 用 DirectBuffer 不释放
- 行动：`-XX:MaxDirectMemorySize=` 调大；查 Netty `ByteBuf` 没 release

### OOM: unable to create new native thread
- 线程数超 ulimit / 内核限制
- 行动：`ulimit -u` + `/proc/sys/kernel/threads-max`；查线程池 leak

### Full GC 频繁
- `jstat -gcutil` 看 Old 区涨速 + Eden / Survivor 流入老年代速度
- 多半是大对象直接进 Old / 业务量涨没扩容 / **内存泄漏**

### CPU 100%
- `top -H` 找线程 → printf %x → `jstack` 搜 nid
- 多半是死循环 / JIT 编译 / 极频繁 GC

## 路径速查表

| 内容 | 路径 |
|------|------|
| GC 日志 | 启动参数指定，常见 `/var/log/<app>/gc.log` |
| Heap dump | OOM 时 `-XX:HeapDumpPath=` 指定（推荐应用日志目录） |
| JFR recording | `jcmd ... JFR.start filename=` 指定 |
| arthas | `~/.arthas/` |
| OpenJDK 二进制 | `/usr/lib/jvm/<jdk-name>/bin/`（Debian） / `/usr/lib/jvm/jre/bin/`（RHEL） |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `kill -9 <java-pid>` | 不写 graceful shutdown 钩子 → 内存中数据丢；连接强断 |
| `jmap -dump -F` | force 模式，**完全 STW（stop-the-world）阻塞进程**；只在崩溃前不得已用 |
| `jcmd <pid> GC.run` 生产高峰 | 触发 Full GC，多核心 STW（可能数百毫秒） |
| arthas `redefine` 在线 patch class | 替换类字节码，**生产改完忘了同步代码** = 重启即丢 |
| arthas `watch` 用 `-x 5` 深层渲染 + 高 QPS | 拷贝大量对象拖死 JVM |

## 教训

- **生产 JVM 必开 GC 日志 + OOM 自动 dump** —— 出事故没有 hprof 等于盲人摸象。
- `-Xms = -Xmx` 避免动态扩容停顿（容器内更要这样）。
- 容器里 Java 默认**只看到宿主 CPU/内存数**（Java 10+ 已修复 cgroup 感知）；用 `+UnlockExperimentalVMOptions +UseCGroupMemoryLimitForHeap` 或升 JDK11+。
- `jmap -dump:live` 会**触发 Full GC**，生产高峰慎用；用 `jcmd ... GC.heap_dump` 行为相同。
- `XX:OnOutOfMemoryError="kill -9 %p"` 配合 systemd `Restart=on-failure` = 自动重启策略（OOM 不试图恢复，直接重启）。
- `jstack` 输出**对人不友好**，复制到 `https://fastthread.io` 上传分析。
- Java 8 的 CMS GC 已被 G1 取代；新部署优先 G1 / ZGC（Java 15+ 默认参数）。

---
