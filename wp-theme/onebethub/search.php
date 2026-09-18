<?php
/**
 * Search results: query header, category filter chips (plain links to
 * ?s=...&cat=ID — intentionally no client-side JS filtering, per the
 * "keep simple" instruction), real WP_Query/have_posts() loop.
 * Ports stitch-export/search-desktop.html.
 */
get_header();

$search_query    = get_search_query();
$total_found     = $GLOBALS['wp_query']->found_posts;
$current_cat_id  = isset( $_GET['cat'] ) ? absint( $_GET['cat'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
?>

<section class="bg-white border-b border-slate-200 pt-6 md:pt-8 pb-6">
	<div class="max-w-content mx-auto px-4 md:px-8">
		<div class="flex flex-col md:flex-row md:items-baseline justify-between gap-3 mb-6">
			<h1 class="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex flex-wrap items-center gap-3">
				<span>'<?php echo esc_html( $search_query ); ?>' <?php esc_html_e( '검색 결과', 'onebethub' ); ?></span>
				<span class="text-sm font-semibold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
					<?php echo esc_html( sprintf( _n( '총 %d건', '총 %d건', $total_found, 'onebethub' ), $total_found ) ); ?>
				</span>
			</h1>
		</div>

		<!-- Category filter chips -->
		<div class="flex flex-wrap items-center gap-2 pb-1">
			<a href="<?php echo esc_url( add_query_arg( array( 's' => $search_query, 'cat' => false ), home_url( '/' ) ) ); ?>"
				class="px-3.5 py-1.5 rounded-full text-xs font-semibold border transition <?php echo ( 0 === $current_cat_id ) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'; ?>">
				<?php esc_html_e( '전체', 'onebethub' ); ?>
			</a>
			<?php foreach ( onebethub_primary_categories() as $cat ) : ?>
				<a href="<?php echo esc_url( add_query_arg( array( 's' => $search_query, 'cat' => $cat->term_id ), home_url( '/' ) ) ); ?>"
					class="px-3.5 py-1.5 rounded-full text-xs font-medium border transition <?php echo ( $current_cat_id === $cat->term_id ) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'; ?>">
					<?php echo esc_html( $cat->name ); ?><?php $en = onebethub_category_en_label( $cat->name ); echo $en ? ' (' . esc_html( $en ) . ')' : ''; ?>
				</a>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<div class="max-w-content mx-auto px-4 md:px-8 py-8">
	<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">

		<div class="lg:col-span-8 space-y-5">
			<?php if ( have_posts() ) : while ( have_posts() ) : the_post(); ?>
				<article class="bg-white rounded-xl border border-slate-200/90 p-5 md:p-6 shadow-xs hover:shadow-md transition-shadow">
					<div class="flex items-start justify-between gap-4 mb-2">
						<div class="flex flex-wrap items-center gap-2">
							<?php foreach ( get_the_category() as $cat ) : echo onebethub_category_badge( $cat, 'lg' ); endforeach; ?>
							<span class="text-xs text-slate-400"><?php esc_html_e( '발행일:', 'onebethub' ); ?> <?php echo esc_html( get_the_date() ); ?></span>
						</div>
					</div>
					<h2 class="text-lg font-bold text-slate-900">
						<a class="hover:text-sky-600 transition-colors" href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
					</h2>
					<p class="text-sm text-slate-600 mt-2.5 line-clamp-2 leading-relaxed"><?php echo esc_html( onebethub_card_excerpt( get_the_ID(), 180 ) ); ?></p>
					<div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
						<span><?php the_author(); ?> · <?php echo esc_html( sprintf( __( '읽는 시간 %d분', 'onebethub' ), onebethub_estimated_read_minutes() ) ); ?></span>
						<a class="font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1" href="<?php the_permalink(); ?>">
							<?php esc_html_e( '리포트 열람하기', 'onebethub' ); ?>
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
						</a>
					</div>
				</article>
			<?php endwhile; ?>

				<nav class="pt-4" aria-label="<?php esc_attr_e( '페이지네이션', 'onebethub' ); ?>">
					<?php
					the_posts_pagination(
						array(
							'mid_size'  => 2,
							'prev_text' => __( '이전', 'onebethub' ),
							'next_text' => __( '다음', 'onebethub' ),
						)
					);
					?>
				</nav>

			<?php else : ?>
				<div class="p-8 text-center bg-white border border-dashed border-slate-300 rounded-xl">
					<h3 class="text-sm font-bold text-slate-900"><?php echo esc_html( sprintf( __( "'%s'에 대한 실사 리포트 결과가 없습니다.", 'onebethub' ), $search_query ) ); ?></h3>
					<p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto"><?php esc_html_e( '정확한 관할 명칭 또는 벤더/솔루션 유형을 확인해 주세요.', 'onebethub' ); ?></p>
					<div class="mt-4">
						<a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-xs inline-block"><?php esc_html_e( '홈으로 돌아가기', 'onebethub' ); ?></a>
					</div>
				</div>
			<?php endif; ?>
		</div>

		<aside class="lg:col-span-4 space-y-6">
			<div class="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
				<h3 class="text-sm font-bold text-slate-900 mb-3"><?php esc_html_e( '카테고리 바로가기', 'onebethub' ); ?></h3>
				<div class="space-y-2">
					<?php foreach ( onebethub_primary_categories() as $cat ) :
						$colors = onebethub_category_colors( $cat->name );
						?>
						<a class="group flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition" href="<?php echo esc_url( get_category_link( $cat ) ); ?>">
							<span class="text-xs font-bold text-slate-800 group-hover:<?php echo esc_attr( $colors['text'] ); ?>"><?php echo esc_html( $cat->name ); ?></span>
							<span class="text-slate-300 group-hover:text-slate-500 font-bold">→</span>
						</a>
					<?php endforeach; ?>
				</div>
			</div>

			<div class="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 text-white shadow-sm">
				<div class="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-wider mb-2"><?php esc_html_e( 'Independence Charter', 'onebethub' ); ?></div>
				<p class="text-xs text-slate-300 leading-relaxed"><?php bloginfo( 'name' ); ?><?php esc_html_e( '는 어떠한 iGaming 플랫폼 벤더로부터도 스폰서십을 받지 않습니다.', 'onebethub' ); ?></p>
			</div>

			<div class="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
				<h4 class="text-sm font-bold text-slate-900 mb-1"><?php esc_html_e( 'B2B 독립 벤더 실사 문의', 'onebethub' ); ?></h4>
				<p class="text-xs text-slate-500 mb-3"><?php esc_html_e( '검토 중인 벤더 견적서를 리서치팀이 교차 검증해 드립니다.', 'onebethub' ); ?></p>
				<a href="mailto:<?php echo esc_attr( get_bloginfo( 'admin_email' ) ); ?>" class="block w-full text-center py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded transition uppercase tracking-wider">
					<?php esc_html_e( '1:1 심층 실사 요청하기', 'onebethub' ); ?>
				</a>
			</div>
		</aside>
	</div>
</div>

<?php get_footer(); ?>
