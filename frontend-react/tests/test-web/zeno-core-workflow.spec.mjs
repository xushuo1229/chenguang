import { expect, test } from '@playwright/test'

async function login(page) {
  await page.goto('/login')
  await page.getByPlaceholder('you@company.com').fill('explorer@zeno.ai')
  await page.getByPlaceholder('至少 6 位').fill('zeno2026')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/workspace/)
}

async function setScenario(page, scenario) {
  await page.evaluate((value) => {
    localStorage.setItem('zeno_mock_scenario', value)
    document.cookie = `zeno_mock_scenario=${value}; path=/`
  }, scenario)
}

async function clearScenario(page) {
  await page.evaluate(() => {
    localStorage.removeItem('zeno_mock_scenario')
    document.cookie = 'zeno_mock_scenario=; Max-Age=0; path=/'
  })
}

test.describe('Zeno AI Workspace 核心流接受测试', () => {
  test('未认证访问受保护页面时重定向到登录页', async ({ page }) => {
    await page.goto('/workspace')
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/agent')
    await expect(page).toHaveURL(/\/login/)
  })

  test('旧路径重定向到新信息架构', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)

    await login(page)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/workspace/)
    await page.goto('/knowledge')
    await expect(page).toHaveURL(/\/learning\/knowledge/)
    await page.goto('/analytics')
    await expect(page).toHaveURL(/\/growth\/analytics/)
  })

  test('Workspace 展示今日计划且存储边界干净', async ({ page }) => {
    await login(page)

    await expect(
      page.getByRole('heading', { name: /Zeno Explorer/ }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: "Today's Plan" })).toBeVisible()
    await expect(page.locator("ul li:has-text('英语听力练习')")).toBeVisible()

    const undone = page.locator("li:has-text('整理迁移文档与风险清单')")
    await undone.getByRole('button', { name: '标记为完成' }).click()
    await expect(undone.locator('span.line-through')).toBeVisible()

    const storage = await page.evaluate(() => ({ ...localStorage }))
    expect(storage).toHaveProperty('zeno_auth')
    expect(storage).not.toHaveProperty('cg_token')
    expect(storage).not.toHaveProperty('cg_user')
    expect(storage).not.toHaveProperty('chenguangData')
  })

  test('Agent 空态建议可用，支持 Personal 与 General 对话及证据', async ({
    page,
  }) => {
    await login(page)
    await page.goto('/agent')

    await expect(page.getByText('Your personal learning agent.')).toBeVisible()
    await page.getByRole('button', { name: '我今天应该学什么？' }).click()
    await expect(page.getByRole('textbox')).toHaveValue('我今天应该学什么？')

    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('根据你近 7 天的同步数据')).toBeVisible()
    await expect(page.getByText('Evidence · 2')).toBeVisible()

    await page.getByRole('tab', { name: 'General AI' }).click()
    await page.getByRole('textbox').fill('解释一下知识图谱')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('你刚才的问题：解释一下知识图谱')).toBeVisible()
  })

  test('Agent 建议可加入今日任务', async ({ page }) => {
    await login(page)
    await page.goto('/agent')

    await page.getByRole('textbox').fill('给我一个学习建议')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('将「复习 Hooks」加入明日计划')).toBeVisible()
    await page.getByRole('button', { name: '加入今日任务' }).click()
    await expect(page.getByText('已加入今日任务')).toBeVisible()

    await page.goto('/workspace')
    await expect(
      page.locator("li:has-text('将「复习 Hooks」加入明日计划')"),
    ).toBeVisible()
  })

  test('主题切换在刷新后保持', async ({ page }) => {
    await login(page)

    await page.getByRole('button', { name: '用户菜单' }).last().click()
    await page.getByRole('menuitem', { name: /深色模式/ }).click()
    await expect(page.locator('html')).toHaveClass(/(?:^|\s)dark(?:\s|$)/)

    await page.reload()
    await expect(page.locator('html')).toHaveClass(/(?:^|\s)dark(?:\s|$)/)

    await page.getByRole('button', { name: '用户菜单' }).last().click()
    await page.getByRole('menuitem', { name: /浅色模式/ }).click()
    await expect(page.locator('html')).not.toHaveClass(/(?:^|\s)dark(?:\s|$)/)
  })

  test('命令菜单支持 ⌘K 快捷键、搜索页面与 Ask Zeno', async ({ page }) => {
    await login(page)

    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.locator('[cmdk-input]').fill('knowledge')
    await page.locator('[cmdk-item]', { hasText: 'Knowledge' }).first().click()
    await expect(page).toHaveURL(/\/learning\/knowledge/)

    await page.getByRole('button', { name: '搜索或跳转' }).click()
    await page.locator('[cmdk-input]').fill('复习')
    await page
      .locator('[cmdk-item]', { hasText: '问：哪些知识需要优先复习' })
      .click()
    await expect(page).toHaveURL(/\/agent/)
    await expect(page.getByRole('textbox')).toHaveValue(
      '哪些知识需要优先复习？',
    )
  })

  test('移动端无侧栏，抽屉导航与上下文折叠可用', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page)

    const greetingBox = await page
      .getByRole('heading', { name: /Zeno Explorer/ })
      .boundingBox()
    expect(greetingBox.x).toBeLessThan(24)

    await page.getByRole('button', { name: '打开导航' }).click()
    const drawer = page.locator('aside:visible').last()
    await expect(drawer.getByRole('link', { name: 'Agent' })).toBeVisible()
    await drawer.getByRole('link', { name: 'Goals' }).click()
    await expect(page).toHaveURL(/\/growth\/goals/)

    await page.goto('/agent')
    const toggle = page.getByRole('button', { name: '工作区上下文' })
    await toggle.click()
    await expect(
      page.getByRole('heading', { name: 'Workspace Signals' }).first(),
    ).toBeVisible()
    await toggle.click()
    await expect(
      page.getByRole('heading', { name: 'Workspace Signals' }),
    ).toHaveCount(0)
  })

  test('Courses 表格可进入详情并继续学习', async ({ page }) => {
    await login(page)
    await page.goto('/learning/courses')

    await expect(page.getByText('Zeno AI 基础与实践')).toBeVisible()
    await page.getByText('Zeno AI 基础与实践').click()
    await expect(page).toHaveURL(/\/learning\/courses\/course-zeno-1/)
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible()

    await page.getByRole('button', { name: /Continue Learning/ }).click()
    await expect(page).toHaveURL(
      /\/learning\/knowledge\?.*course=course-zeno-1/,
    )
  })

  test('Knowledge 标签进入 URL，图谱节点可查看详情', async ({ page }) => {
    await login(page)
    await page.goto('/learning/knowledge')

    await page.getByRole('button', { name: '掌握度' }).click()
    await expect(page).toHaveURL(/tab=mastery/)
    await expect(page.getByText('ES Modules').first()).toBeVisible()

    await page.goto('/learning/knowledge?tab=graph')
    await expect(page).toHaveURL(/tab=graph/)
    await page.getByText('ES Modules').first().click()
    await expect(page.getByText('语言级模块系统')).toBeVisible()
  })

  test('Goals 可更新进度并新建目标', async ({ page }) => {
    await login(page)
    await page.goto('/growth/goals')

    await expect(page.getByText('完成 Zeno 架构迁移')).toBeVisible()
    await page
      .locator("li:has-text('完成 Zeno 架构迁移')")
      .getByRole('button', { name: '更新进度' })
      .click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('spinbutton').fill('90')
    await dialog.getByRole('button', { name: '保存进度' }).click()
    await expect(dialog).toBeHidden()

    await page.getByRole('button', { name: '新建目标' }).click()
    const goalDialog = page.getByRole('dialog')
    await goalDialog
      .getByPlaceholder('目标标题，如：本月读完 4 本书')
      .fill('通过期末英语考试')
    await goalDialog.getByPlaceholder('目标值（数值，如 4）').fill('90')
    await page.getByRole('button', { name: '创建目标' }).click()
    await expect(page.getByText('通过期末英语考试')).toBeVisible()
  })

  test('Growth Memory 展示分类记忆与推断说明', async ({ page }) => {
    await login(page)
    await page.goto('/growth/memory')

    await expect(page.getByRole('heading', { name: 'preference' })).toBeVisible()
    await expect(page.getByText('偏好早晨先处理最难的学习任务')).toBeVisible()
    await expect(page.getByText('Agent 推断').first()).toBeVisible()
  })

  test('Analytics 可切换范围，快速记录后反映真实写入', async ({ page }) => {
    await login(page)
    await page.goto('/growth/analytics')

    await expect(page.getByRole('heading', { name: '成长分析' })).toBeVisible()
    await expect(page.getByText('920', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: '近 7 天' }).click()
    await expect(page.getByText('540', { exact: true })).toBeVisible()

    await page.goto('/workspace')
    await page.getByRole('button', { name: '打卡', exact: true }).click()
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await page.getByRole('button', { name: '专注', exact: true }).click()
    await page.getByPlaceholder('专注分钟数').fill('30')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    await page.goto('/growth/analytics')
    await expect(page.getByText('950', { exact: true })).toBeVisible()
  })

  test('PUT 版本冲突时回滚写入并提示，重试可成功', async ({ page }) => {
    await login(page)

    await page.evaluate(() => {
      document.cookie = 'zeno_mock_force_conflict=1; path=/'
    })

    await page.getByRole('button', { name: '专注', exact: true }).click()
    await page.getByPlaceholder('专注分钟数').fill('30')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(
      page.getByText('数据版本冲突：本地修改晚于云端，请合并后重试'),
    ).toBeVisible()

    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.goto('/growth/analytics')
    await expect(page.getByText('920', { exact: true })).toBeVisible()

    await page.goto('/workspace')
    await page.getByRole('button', { name: '专注', exact: true }).click()
    await page.getByPlaceholder('专注分钟数').fill('30')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await page.goto('/growth/analytics')
    await expect(page.getByText('950', { exact: true })).toBeVisible()
  })

  test('空数据场景显示空态，loading 显示骨架，error 可重试', async ({
    page,
  }) => {
    await login(page)

    await setScenario(page, 'empty')
    await page.goto('/workspace')
    await expect(page.getByText('今天还没有计划。')).toBeVisible()
    await expect(page.getByText('还没有学习记录，从下方快速记录开始。')).toBeVisible()

    await setScenario(page, 'loading')
    await page.goto('/workspace')
    await expect(page.locator('.animate-pulse').first()).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Zeno Explorer/ }),
    ).toBeVisible({ timeout: 10000 })

    await setScenario(page, 'error')
    await page.goto('/workspace')
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible({ timeout: 10000 })
    const retry = alert.getByRole('button', { name: '重试' })
    await expect(retry).toBeVisible()
    await clearScenario(page)
    await retry.click()
    await expect(
      page.getByRole('heading', { name: "Today's Plan" }),
    ).toBeVisible()
  })
})
