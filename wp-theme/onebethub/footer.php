<?php
/**
 * Shared footer: corporate identity, taxonomy links (dynamic via
 * wp_list_categories), governance/ethics links, contact block, and the
 * neutral institutional disclaimer. Static copy adapted from the Stitch
 * mockups, which were already written in a vendor-neutral voice.
 */
?>
	</main><!-- #main-content -->

	<footer class="bg-slate-950 text-slate-400 text-xs border-t border-slate-800 mt-16 pt-10 md:pt-12 pb-8">
		<div class="max-w-content mx-auto px-4 md:px-8">
			<div class="grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-slate-800">
				<!-- Corporate identity -->
				<div class="md:col-span-4 space-y-3">
					<div class="flex items-center space-x-3">
						<span class="font-serif-headline text-lg font-bold text-white tracking-tight">One<span class="text-sky-400">Bet</span>Hub</span>
					</div>
					<p class="text-slate-400 leading-relaxed text-xs max-w-sm">
						<?php bloginfo( 'name' ); ?>는 글로벌 온라인 카지노, 스포츠북 배당 엔진 및 화이트라벨 소프트웨어 공급망을 감사·조사하는 독립 B2B 인텔리전스 미디어입니다. 특정 벤더를 홍보하거나 대행하지 않습니다.
					</p>
				</div>

				<!-- Dynamic taxonomy links -->
				<div class="md:col-span-3 space-y-2">
					<div class="text-slate-200 font-bold tracking-wider uppercase text-[11px] font-mono"><?php esc_html_e( 'Taxonomy & Research', 'onebethub' ); ?></div>
					<ul class="space-y-1.5 text-xs">
						<?php
						$footer_cats = onebethub_primary_categories();
						foreach ( $footer_cats as $i => $cat ) :
							$en = onebethub_category_en_label( $cat->name );
							?>
							<li>
								<a class="hover:text-white transition" href="<?php echo esc_url( get_category_link( $cat ) ); ?>">
									<?php echo esc_html( str_pad( (string) ( $i + 1 ), 2, '0', STR_PAD_LEFT ) . ' ' . $cat->name ); ?><?php echo $en ? ' (' . esc_html( $en ) . ')' : ''; ?>
								</a>
							</li>
						<?php endforeach; ?>
					</ul>
				</div>

				<!-- Governance -->
				<div class="md:col-span-2 space-y-2">
					<div class="text-slate-200 font-bold tracking-wider uppercase text-[11px] font-mono"><?php esc_html_e( 'Governance', 'onebethub' ); ?></div>
					<ul class="space-y-1.5 text-xs">
						<li><a class="hover:text-white transition" href="#editorial-charter"><?php esc_html_e( '편집권 독립 선언서', 'onebethub' ); ?></a></li>
						<li><a class="hover:text-white transition" href="#methodology"><?php esc_html_e( '벤더 평가 방법론', 'onebethub' ); ?></a></li>
						<li><a class="hover:text-white transition" href="mailto:<?php echo esc_attr( get_bloginfo( 'admin_email' ) ); ?>"><?php esc_html_e( '익명 제보 창구', 'onebethub' ); ?></a></li>
						<li><a class="hover:text-white transition" href="#corrections"><?php esc_html_e( '정정 및 반론 보도 정책', 'onebethub' ); ?></a></li>
					</ul>
				</div>

				<!-- Contact -->
				<div class="md:col-span-3 space-y-2">
					<div class="text-slate-200 font-bold tracking-wider uppercase text-[11px] font-mono"><?php esc_html_e( 'Analyst Contact & Inquiries', 'onebethub' ); ?></div>
					<p class="text-slate-400 text-xs leading-relaxed"><?php esc_html_e( '벤더 실사 제보, SLA 분쟁 데이터 제공 및 기업 구독 문의:', 'onebethub' ); ?></p>
					<div class="font-mono text-slate-200 text-xs">
						<p>E: <a class="text-sky-400 hover:underline" href="mailto:<?php echo esc_attr( get_bloginfo( 'admin_email' ) ); ?>"><?php echo esc_html( get_bloginfo( 'admin_email' ) ); ?></a></p>
					</div>
				</div>
			</div>

			<div class="pt-6 flex flex-col md:flex-row items-center justify-between text-[11px] text-slate-400 gap-3">
				<p class="max-w-3xl leading-relaxed">
					<strong><?php esc_html_e( 'Institutional Disclaimer:', 'onebethub' ); ?></strong>
					<?php esc_html_e( '본 매체에 게재된 인텔리전스는 공익적 정보 제공 및 기술적 소프트웨어 아키텍처 비교를 목적으로 하며, 특정 관할권에서 불법으로 규정된 도박 영업을 조장하거나 유인하지 않습니다. 모든 이용자는 소재 지역 법률을 준수할 책임이 있습니다.', 'onebethub' ); ?>
				</p>
				<p class="shrink-0 font-mono">© <?php echo esc_html( date_i18n( 'Y' ) ); ?> <?php bloginfo( 'name' ); ?>. All rights reserved.</p>
			</div>
		</div>
	</footer>

<?php wp_footer(); ?>
</body>
</html>
