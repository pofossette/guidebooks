归档旧的plan.md 使用“writing-plans”将新计划写入plan.md。新plan要求：用于跟踪任务进度的复选框 每个阶段完成的标准 每个阶段要做的文档更新 每个阶段要做的测试/eval更新 必要的示例结构或代码

阅读 plan.md ,使用“subagent driven develop”完成计划剩余部分并输出一个执行报告

```crontab
0 8 27 5 * export HOME=/home/wunai && cd /home/wunai/project/temp/TrapMap-for-vibing && /home/wunai/.local/bin/claude --dangerously-skip-permissions -p "阅读 plan.md 审计前几个阶段的任务完成情况，修复偏差，修复完成后本地运行ci流程修复至无报错，之后运行pnpm check，完成后提交所有工作区修改" >> /tmp/missionary-6.log 2>&1
0 1 7 5 * export HOME=/home/wunai && cd /home/wunai/project/temp/TrapMap-for-vibing && /home/wunai/.local/bin/claude --dangerously-skip-permissions -p "阅读 plan.md 开始完成第一阶段任务，完成后提交所有工作区修改" >> /tmp/trapmap-1.log 2>&1
0 11 7 5 * export HOME=/home/wunai && cd /home/wunai/project/temp/TrapMap-for-vibing && /home/wunai/.local/bin/claude --dangerously-skip-permissions -p "阅读 plan.md 审计前几个阶段的任务完成情况，修复偏差，修复完成后本地运行ci流程修复至无报错，之后运行pnpm check，完成后提交所有工作区修改" >> /tmp/trapmap-11.log 2>&1
0 15 31 5 * export HOME=/home/wunai && cd /home/wunai/project/temp/TrapMap-for-vibing && /home/wunai/.local/bin/claude --dangerously-skip-permissions -p "/understand-anything:understand --language zh" >> /tmp/trapmap-understanding.log 2>&1
```
