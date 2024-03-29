---
title: "Minimun Spanning Tree"
subtitle: "Implement a MST"
layout: post
author: "DooDoo"
header-style: text
keywords: "Jekyll, 블로그, 개발, 알고리즘, algorithm, MST"
tags:
  - Algorithm
  - Graph
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
int find(vector<int &parent, int x) {
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

    for(int = 0; i < V; ++i) {
        // 맨 처음 부모는 자기 자신으로 초기화
        parent[i] = i;
        rank[i] = 1;
        for (auto& edge : graph[i]) {
            edges.push_back({i, edge.first, edge.second});
        }
    }
    // 가중치를 기준으로 정렬
    sort(edges.begin(), edges.end(), [](Edge x, Edge y) {
        retrun x.weight < y.weight;
    })

    // 간선을 하나씩 선택하며, 그루스칼 알고리즘 적용
    vector<Edge> result;
    for (auto& edge : edges) {
        int u = edge.src, v = edge,deset, weight = edge.weight;
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
