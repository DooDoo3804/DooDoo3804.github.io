---
title: "Floyd Warshall"
subtitle: "Implement a Floyd Warshall"
layout: post
date: "2023-07-11"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "algorithm, floyd-warshall, shortest path, graph, dynamic programming"
series: "알고리즘"
tags:
  - Algorithm
  - Graph
categories:
  - algorithm
description: "플로이드-워셜 알고리즘의 개념과 C++ 구현을 정리합니다. DP 기반으로 모든 노드 쌍의 최단 경로를 구하는 원리와 음수 가중치 그래프에서의 동작 방식을 코드 예제와 함께 설명합니다."
---

플로이드-워셜 알고리즘이란
---
그래프에서 모든 노드 쌍 간의 최단 경로를 찾는 알고리즘
다익스트라와 다르게 음수 가중치를 가진 그래프에서도 동작한다. 모든 지점에서 다른 모든 지점까지의 최단 경로를 모두 구해야 하는 경우에 사용할 수 있다.
<b>DP(Dynamic Programming)</b>를 기반으로 동작한다.
점화식은 아래와 같다.
```
D_ab = min(D_ab, D_ak + D_kb)
```
A에서 B로 가는 최소 비용과 A에서 K를 거쳐 B로 가는 비용을 비교하여 더 작은 값으로 갱신
다익스트라 알고리즘에 비해서 구현이 쉽다.

---
플로이드-워셜 구현
---
[ with <B>`C++`</B> ]

```c++
#define INF 2134567890

int main() {
    // 그래프 예시
    vector<vector<int>> graph = {
        {0, 5, INF, 10},
        {INF, 0, 3, INF},
        {INF, INF, 0, 1},
        {INF, INF, INF, 0},
    };

    // 그래프의 인접 행렬을 dist로 복사
    int n = graph.size();
    vector<vector<int>>dist(n, vector<int>(n));
    for (int i = 0; i < n; ++i) {
        for (int j = 0; j < n; ++j) {
            dist[i][j] = graph[i][j];
        }
    }

    // 플로이드 워셜 알고리즘
    // k : 중간 거치는 노드
    for (int k = 0; k < n; ++k) {
        // (i j) vs (i k j)
        for (int i = 0; i < n; ++i) {
            for (int j = 0; j < n; ++j) {
                if (dist[i][k] != INF && dist[k][j] != INF && dist[i][k] + dist[k][j] < dist[i][j]) {
                    dist[i][j] = dist[i][k] + dist[k][j];
                }
            }
        }
    }
    return 0;
}
```

---

## 관련 포스트

- [Minimum Spanning Tree — 크루스칼 알고리즘](/algorithm/2023/07/12/minimun-spanning-tree-kruskal/)
- [Segment Tree — 구간 쿼리를 위한 트리 자료구조](/algorithm/2023/06/19/Segment-tree/)
- [Trie 자료구조 — 원리와 구현](/algorithm/2026/04/01/trie/)
