export const MOCK_POINTS = Object.freeze([
  {
    id: 'p01',
    question: 'TCP 与 UDP 的核心区别是什么？各举一个典型应用场景。',
    answer: 'TCP 面向连接、可靠交付、面向字节流、全双工，首部最小 20 字节，适用于文件传输、网页浏览；UDP 无连接、尽最大努力交付、面向数据报，首部固定 8 字节，适用于视频直播、DNS 查询、在线游戏。'
  },
  {
    id: 'p02',
    question: 'TCP 与 UDP 的首部长度各是多少？TCP 首部最长多少、由什么字段决定？',
    answer: 'TCP 固定部分 20 字节，含选项最长 60 字节（数据偏移字段以 4 字节为单位、最大 15）；UDP 固定 8 字节：源端口、目的端口、长度、校验和各 2 字节。'
  },
  {
    id: 'p03',
    question: '写出三次握手的过程，并解释为什么不能是两次。',
    answer: '① 客户端 SYN=1、seq=x；② 服务端 SYN=1、ACK=1、seq=y、ack=x+1；③ 客户端 ACK=1、seq=x+1、ack=y+1。两次握手时，已失效的连接请求突然到达服务端会错误建立连接、浪费资源；三次才能同步双方 ISN 并确认双方收发能力。'
  },
  {
    id: 'p04',
    question: '写出四次挥手的过程，并解释为什么是四次而不是三次。',
    answer: '① 主动方 FIN=1、seq=u；② 被动方 ACK、ack=u+1（半关闭）；③ 被动方数据发完后 FIN=1、seq=w；④ 主动方 ACK、ack=w+1 进入 TIME_WAIT。全双工两个方向独立关闭，被动方的 ACK 与 FIN 之间可能还有数据要发，不能合并，故四次。'
  },
  {
    id: 'p05',
    question: 'TIME_WAIT 为什么等待 2MSL？两个作用分别是什么？',
    answer: '主动关闭方发出最后一个 ACK 后等待 2MSL（最长报文段寿命两倍）。作用一：末个 ACK 丢失时被动方重传 FIN，仍能重发 ACK 正常关闭；作用二：让本连接旧报文在网络中消散，避免污染相同四元组的新连接。'
  },
  {
    id: 'p06',
    question: 'TCP 序号与确认号的含义？ack=N 代表什么？',
    answer: '序号 seq 是本报文段第一个数据字节的编号（字节流编号）；确认号 ack 是期望收到对方下一个报文段第一个数据字节的序号。ack=N 表示 N−1 为止的字节已全部正确收到；ACK 标志为 1 时确认号才有效。'
  },
  {
    id: 'p07',
    question: '滑动窗口如何实现流量控制？窗口为 0 时怎么办？',
    answer: '接收方在 ACK 中通告接收窗口 rwnd，发送窗口不得超过 rwnd，使发送速率匹配接收能力。窗口为 0 时发送方停发数据并启动持续计时器，定期发窗口探测报文防止死锁。流量控制是端到端机制。'
  },
  {
    id: 'p08',
    question: '流量控制与拥塞控制的区别？实际发送窗口如何取值？',
    answer: '流量控制防接收方来不及接收（端到端，依据 rwnd）；拥塞控制防过多数据注入网络导致路由器/链路过载（全局性，依据 cwnd）。实际发送窗口 = min(rwnd, cwnd)。'
  },
  {
    id: 'p09',
    question: '慢启动的窗口增长规律是什么？何时转入拥塞避免？',
    answer: '连接开始 cwnd=1 MSS，每收到一个新报文段的确认 cwnd 加 1 MSS，即每 RTT 翻倍（指数增长）；达到慢启动门限 ssthresh 后转入拥塞避免。"慢"指相对一开始注入大量数据而言。'
  },
  {
    id: 'p10',
    question: '拥塞避免阶段窗口如何增长？发生超时后如何处理？',
    answer: '加性增：每 RTT cwnd 增加 1 MSS（线性增长）。一旦超时：ssthresh 设为当前 cwnd 的一半，cwnd 重置为 1 MSS，重新执行慢启动。'
  },
  {
    id: 'p11',
    question: '快重传的触发条件是什么？解决了什么问题？',
    answer: '接收方每收到失序报文段立即发重复确认；发送方一连收到 3 个重复 ACK 就立即重传缺失报文段，不必等重传计时器超时，显著降低恢复时延。'
  },
  {
    id: 'p12',
    question: '快恢复与超时处理的窗口变化有何不同？为什么？',
    answer: '收到 3 个重复 ACK：ssthresh 与 cwnd 均减半（乘性减），直接进入拥塞避免，不回慢启动；超时则 cwnd 回 1 MSS 重走慢启动。因为能收到重复 ACK 说明网络仍有交付能力，只是个别报文丢失。'
  }
]);

export function mockDeck() {
  return {
    schemaVersion: 1,
    deckId: 'd-mock',
    title: '示例课件 · TCP 核心机制（12 考点）',
    sourceType: 'mock',
    createdAt: '2026-11-18T00:00:00.000Z',
    points: MOCK_POINTS.map((p) => ({ ...p }))
  };
}