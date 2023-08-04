---
title: "How to use React in Jekyll app"
subtitle: "React with Jekyll"
layout: post
author: "DooDoo"
keywords: "jekyll, react"
tags:
    react
---

How to Use React in Jekyll
----

### Create react app
Create reat app in base directory that your Jekyll project.  
Use below code
```
npx create-react-app dev-react-pages
cd dev-react-pages
npm start
```
Then, you can see `dev-react-pages` application and will starting. dev-react-pages is only develop folder. 
Now, we will create `react-pages` that deployment only.  
<br>

### Add react settings
Add below lines to ignore node_modules when we commit.
```
dev-react-pages/node_modules/
dev-react-pages/build/
```
  
Also add below lines in Jekyll project `_config.yml`. Jekyll doesn't have to know about react.
```
exclude:
  - node_modules
  - dev-react-pages
```
<br>

### Make your react webpage uri
Make your react project webpage uri to add below line. Thar will be `{your git-hub-pages-uri}\{react-uri}`.  
There is an example [https://doodoo3804.github.io/react-pages/](https://doodoo3804.github.io/react-pages/)
```
"homepage": "/react-pages/"
```

### Write build and deployment scrit
To deploy react page, build and copy results to deployment directory that we made first step and commit then.
There need some lines to build and deployment. To do this easily, we going to write some lines in react application `package.json`.
```
"scripts": {
  "start": "react-scripts start",
  "build": "react-scripts build",
  "test": "react-scripts test",
  "eject": "react-scripts eject",
  
  // add here
    "predeploy": "npm run build",
    "purge": "rmdir /s /q ..\\react-pages\\static && xcopy .\\build\\* ..\\react-pages\\ /E /y",
    "deploy": "npm run purge && npm run frontmatter"
},
```
After that, `yarn run deploy` to build and copy results. Last step is check your react page and commit all results.