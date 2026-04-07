---
title: "Minimum Spanning Tree"
subtitle: "Implement a MST"
layout: post
date: "2023-07-12"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "algorithm, MST, kruskal, union-find, graph"
series: "알고리즘"
tags:
  - Algorithm
  - Graph
categories:
  - algorithm
description: "최소 신장 트리(MST) 개념과 크루스칼 알고리즘 C++ 구현을 다룹니다. 그리디 기반 간선 선택, Union-Find 자료구조를 활용한 사이클 판별 과정을 코드와 함께 설명합니다."
---

MST 최소 신장 트리
---
신장 트리란 하나의 그래프가 있을 때 모든 노드를 포함하면서 사이클이 존재하지 않는 부분 그래프를 의미한다.  
최소한의 비용으로 신장 트리를 찾는 것이 MST 알고리즘이다.  

MST 구현
--
### 1. 그루스칼(Kruskal)
>그리디 알고리즘의 일종으로 분류

모든 간선에 대하여 정렬을 수행한 뒤에 가장 거리가 짧은 간선부터 집합에 포함  
사이클을 발생하는 경우 집합에서 제외한다.  
일종의 트리 구조이므로 최종적으로 만들어지는 신장 트리에 포함되는 간선의 개수가 `노드의 개수 - 1`과 같다.  
<br>
<b>그루스칼 알고리즘 구현</b>  
[ with <B>`C++`</B> ]
```c++
// 정점이 7개인 그래프로 예시
const int V = 7;
vector<vector<pair<int, int>>>graph;

struct Edge {
    int src, dest, weight;
};

// 노드 x의 부모를 찾는 함수
int find(vector<int>& parent, int x) {
    if (parent[x] != x) {
        parent[x] = find(parent, parent[x]);
    }
    return parent[x];
}

// 두 노드가 속한 집합을 합치는 함수
void merge(vector<int>&parent, vector<int>& rank, int u, int v) {
    u = find(parent, u);
    v = find(parent, v);
    if (rank[u] > rank[v]) {
        swap(u, v);
    }
    parent[u] = v;
    if(rank[u] == rank[v]) {
        rank[v]++;
    }
}

// 그루스칼 알고리즘
vector<Edge> kruskal() {
    // 그래프의 간선을 모두 추출한 뒤, 가중치를 기준으로 오름차순으로 정렬
    vector<Edge> edges;
    vector<int>parent(V);
    vector<int>rank(V);

    for(int i = 0; i < V; ++i) {
        // 맨 처음 부모는 자기 자신으로 초기화
        parent[i] = i;
        rank[i] = 1;
        for (auto& edge : graph[i]) {
            edges.push_back({i, edge.first, edge.second});
        }
    }
    // 가중치를 기준으로 정렬
    sort(edges.begin(), edges.end(), [](Edge x, Edge y) {
        return x.weight < y.weight;
    });

    // 간선을 하나씩 선택하며, 그루스칼 알고리즘 적용
    vector<Edge> result;
    for (auto& edge : edges) {
        int u = edge.src, v = edge.dest, weight = edge.weight;
        if (find(parent, u) != find(parent, v)) {
            merge(parent, rank, u, v);
            result.push_back(edge);
        }
    }
    return result;
}

int main() {
    vector<Edge> result = kruskal();
    return 0;
}
```

---

## 관련 포스트

- [Floyd Warshall — 모든 쌍 최단 경로](/algorithm/2023/07/11/floyd-warshall/)
- [Segment Tree — 구간 쿼리를 위한 트리 자료구조](/algorithm/2023/06/19/Segment-tree/)
- [Trie 자료구조 — 원리와 구현](/algorithm/2026/04/01/trie/)
