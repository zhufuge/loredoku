import type { Knex } from 'knex';

/**
 * v0.7.13 (docs/v0.7.13.md §11) —— 角色带上「成为参与者时的默认值」两列。
 *
 * 一个角色被 加入 到谜题的参与者区时，槽位要填三样东西：主题色与编号展示
 * （还有线索与联动，那两样本来就留空）。主题色一直是 `DEFAULT_THEME_COLOR`
 * 白，编号一直是序号 —— 同一个角色在一批谜题里反复出现，就得一遍遍重填。
 * 这两列把「这个角色自己的默认」放到角色上，加入时抄过去，之后照旧可以在
 * 参与者抽屉里改。
 *
 * 两列都**可空**，且语义是「没有默认」而不是「默认是空」：
 *
 *   - `color` NULL → 槽位照旧用 `DEFAULT_THEME_COLOR`；
 *   - `display_name` NULL → 槽位照旧显示序号。
 *
 * 不做回填，也不改任何已有行 —— 老角色的行为一个像素都不变。因此 `down`
 * 就是两刀 `DROP COLUMN`，丢掉的是「用户后来填的默认值」这一个信息，没有
 * 别的东西依赖它（`puzzles.data.characterSlots` 里已经抄过去的 `themeColor`
 * / `displayNumber` 是副本，删列不动它们）。
 *
 * 为什么是**两列**而不是塞进现有的某一列：`bg_color` 是角色自己的长相
 * （纯色块模式），`color` 是它给槽位的主题色 —— 一个角色完全可以是红色
 * 色块、却带着蓝色主题色。混在一起会让人以为改外观就改了参与者配色。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('characters', (table) => {
    table.text('color').nullable();
    table.text('display_name').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('characters', (table) => {
    table.dropColumn('display_name');
    table.dropColumn('color');
  });
}
