import { expect, test } from '@playwright/test'

async function login(page) {
  await page.goto('/login')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test.describe('Zeno AI Workspace 核心流接受测试', () => {
  test('未认证访问受保护页面时重定向到登录页', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/agent')
    await expect(page).toHaveURL(/\/login/)
  })

  test('登录后展示企业级 Dashboard 且存储边界干净', async ({ page }) => {
    await login(page)

    await expect(
      page.getByRole('heading', { name: '今日成长概览' }),
    ).toBeVisible()

    await expect(page.getByText('今日任务', { exact: true })).toBeVisible()
    await expect(page.getByText('今日专注', { exact: true })).toBeVisible()
    await expect(page.getByText('连续学习', { exact: true })).toBeVisible()
    await expect(page.getByText('知识掌握', { exact: true })).toBeVisible()

    await expect(page.locator('.recharts-surface')).toHaveCount(2)
    await expect(page.locator('table tbody tr')).toHaveCount(6)

    const storage = await page.evaluate(() => ({ ...localStorage }))
    expect(storage).toHaveProperty('zeno_mock_session')
    expect(storage).not.toHaveProperty('cg_token')
    expect(storage).not.toHaveProperty('cg_user')
    expect(storage).not.toHaveProperty('chenguangData')
  })

  test('Agent 支持 Personal 与 General 双模式对话并展示证据', async ({
    page,
  }) => {
    await login(page)
    await page.goto('/agent')

    await expect(
      page.getByRole('heading', { name: 'Zeno Agent' }),
    ).toBeVisible()

    await page.getByRole('textbox').fill('我今天该推进什么？')
    await page.getByRole('button', { name: '发送' }).click()

    await expect(
      page.getByText('根据你近 7 天的同步数据', { exact: false }),
    ).toBeVisible()
    await expect(page.getByText('Evidence Bound')).toBeVisible()

    await page.getByRole('tab', { name: 'General AI' }).click()
    await page.getByRole('textbox').fill('解释一下知识图谱')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(
      page.getByText('你刚才的问题：解释一下知识图谱'),
    ).toBeVisible()
  })

  test('主题切换在刷新后保持', async ({ page }) => {
    await login(page)

    await page.getByRole('button', { name: '深色模式' }).click()
    await expect(page.locator('html')).toHaveClass(/(?:^|\s)dark(?:\s|$)/)

    await page.reload()
    await expect(page.locator('html')).toHaveClass(/(?:^|\s)dark(?:\s|$)/)

    await page.getByRole('button', { name: '浅色模式' }).click()
    await expect(page.locator('html')).not.toHaveClass(/(?:^|\s)dark(?:\s|$)/)
  })

  test('命令面板可以搜索并把快捷问题送入 Agent', async ({ page }) => {
    await login(page)

    await page.getByRole('button', { name: /搜索或跳转/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.locator('[cmdk-input]').fill('复习')
    await page
      .locator('[cmdk-item]', { hasText: '哪些知识需要优先复习' })
      .click()

    await expect(page).toHaveURL(/\/agent/)
    await expect(page.getByRole('textbox')).toHaveValue(
      '哪些知识需要优先复习？',
    )
    await expect(page).not.toHaveURL(/q=/)
  })

  test('移动端无侧栏占位偏移且上下文可折叠', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page)

    const headingBox = await page
      .getByRole('heading', { name: '今日成长概览' })
      .boundingBox()
    expect(headingBox.x).toBeLessThan(24)
    expect(headingBox.x + headingBox.width).toBeLessThanOrEqual(390)

    await page.goto('/agent')
    const toggle = page.getByRole('button', { name: '工作区上下文' })
    await toggle.click()
    const mobileSignals = page
      .getByRole('heading', { name: 'Workspace Signals' })
      .first()
    await expect(mobileSignals).toBeVisible()

    await toggle.click()
    await expect(mobileSignals).toBeHidden()
  })

  test('空数据 mock 场景显示任务空态且可恢复', async ({ page }) => {
    await login(page)

    await page.evaluate(() =>
      localStorage.setItem('zeno_mock_scenario', 'empty'),
    )
    await page.reload()

    await expect(page.getByText('今日暂无计划任务')).toBeVisible()
    await expect(page.locator('table tbody tr')).toHaveCount(0)
    await expect(page.locator('.recharts-surface')).toHaveCount(2)

    await page.evaluate(() =>
      localStorage.removeItem('zeno_mock_scenario'),
    )
    await page.reload()

    await expect(page.locator('table tbody tr')).toHaveCount(6)
    await expect(page.getByText('今日暂无计划任务')).toHaveCount(0)
  })
})
