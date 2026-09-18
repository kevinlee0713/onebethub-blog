<?php
/**
 * Homepage: hero + 2 trending cards, latest-intelligence feed (8 cols),
 * institutional sidebar rail (4 cols). Ports stitch-export/home-desktop.html.
 * front-page.php is used for the site root regardless of the Reading >
 * "front page displays" setting, so this always renders "/" — no static
 * page needs to be configured.
 */
get_header();

$hero_query = new WP_Query(
	array(
		'posts_per_page' => 3,
		'post_status'    => 'publish',
		'ignore_sticky_posts' => true,
	)
);
$hero_ids = wp_list_pluck( $hero_query->posts, 'ID' );

$feed_paged = max( 1, get_query_var( 'paged' ) ? get_query_var( 'paged' ) : ( get_query_var( 'page' ) ? get_query_var( 'page' ) : 1 ) );
$feed_query = new WP_Query(
	array(
		'posts_per_page'      => 8,
		'paged'               => $feed_paged,
		'post_status'         => 'publish',
		'post__not_in'        => ( 1 === $feed_paged ) ? $hero_ids : array(),
		'ignore_sticky_posts' => true,
	)
);
?>

<?php if ( $hero_query->have_posts() && 1 === $feed_paged ) : ?>
<section class="bg-white border-b border-slate-200 py-6 md:py-8" id="featured-report">
	<div class="max-w-content mx-auto px-4 md:px-8">
		<div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
			<div class="flex items-center space-x-2">
				<span class="h-2.5 w-2.5 bg-slate-900"></span>
				<h2 class="text-xs font-bold uppercase tracking-wider text-slate-900 font-mono"><?php esc_html_e( 'Latest Intelligence', 'onebethub' ); ?></h2>
			</div>
		</div>
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
			<?php
			$hero_query->the_post();
			$primary_cats = get_the_category();
			?>
			<article class="lg:col-span-7 lg:pr-4 lg:fine-border-r flex flex-col justify-between">
				<div>
					<div class="flex flex-wrap items-center gap-2 mb-3">
						<?php foreach ( array_slice( $primary_cats, 0, 2 ) as $cat ) : echo onebethub_category_badge( $cat, 'lg' ); endforeach; ?>
						<time class="text-xs text-slate-400 ml-auto font-mono" datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>"><?php echo esc_html( get_the_date() ); ?></time>
					</div>
					<h1 class="font-serif-headline text-2xl md:text-3xl xl:text-4xl font-bold leading-tight text-slate-950 mb-3 tracking-tight hover:text-sky-900 transition">
						<a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
					</h1>
					<p class="text-slate-600 text-sm leading-relaxed mb-6"><?php echo esc_html( onebethub_card_excerpt( get_the_ID(), 180 ) ); ?></p>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
					<div class="flex items-center space-x-3">
						<?php echo get_avatar( get_the_author_meta( 'ID' ), 40, '', '', array( 'class' => 'rounded-full ring-1 ring-slate-300' ) ); ?>
						<div>
							<p class="text-xs font-bold text-slate-900"><?php the_author(); ?></p>
							<p class="text-[11px] text-slate-500"><?php echo esc_html( sprintf( _n( '읽는 시간 약 %d분', '읽는 시간 약 %d분', onebethub_estimated_read_minutes(), 'onebethub' ), onebethub_estimated_read_minutes() ) ); ?></p>
						</div>
					</div>
					<a class="inline-flex items-center justify-center px-4 py-2.5 bg-slate-900 hover:bg-brand-tertiary text-white text-xs font-semibold rounded transition shadow-sm" href="<?php the_permalink(); ?>">
						<span><?php esc_html_e( '리포트 열람하기', 'onebethub' ); ?></span>
						<span class="ml-1.5 font-mono">→</span>
					</a>
				</div>
			</article>

			<div class="lg:col-span-5 flex flex-col gap-4">
				<?php
				$secondary_count = 0;
				while ( $hero_query->have_posts() && $secondary_count < 2 ) :
					$hero_query->the_post();
					$secondary_count++;
					$cats = get_the_category();
					?>
					<article class="bg-white p-5 rounded border border-slate-200 hover:border-slate-300 hover:shadow-xs transition flex flex-col justify-between h-full">
						<div>
							<div class="flex items-center justify-between mb-2 gap-2">
								<?php if ( ! empty( $cats ) ) : echo onebethub_category_badge( $cats[0] ); endif; ?>
								<span class="text-[11px] text-slate-400 font-mono shrink-0"><?php echo esc_html( sprintf( '%d MIN', onebethub_estimated_read_minutes() ) ); ?></span>
							</div>
							<h3 class="font-serif-headline text-lg font-bold text-slate-900 mb-2 leading-snug hover:text-sky-800">
								<a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
							</h3>
							<p class="text-xs text-slate-600 line-clamp-3 leading-relaxed mb-3"><?php echo esc_html( onebethub_card_excerpt( get_the_ID(), 110 ) ); ?></p>
						</div>
						<div class="flex items-center justify-between pt-3 border-t border-slate-100 text-[11px]">
							<time class="text-slate-500 font-mono font-medium"><?php echo esc_html( get_the_date() ); ?></time>
							<a class="text-sky-700 font-semibold hover:underline" href="<?php the_permalink(); ?>"><?php esc_html_e( '리포트 보기 →', 'onebethub' ); ?></a>
						</div>
					</article>
				<?php endwhile; ?>
			</div>
		</div>
	</div>
</section>
<?php wp_reset_postdata(); endif; ?>

<div class="max-w-content mx-auto px-4 md:px-8 py-8">
	<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">

		<!-- Main feed -->
		<section class="lg:col-span-8 space-y-6">
			<div class="flex items-center justify-between pb-3 border-b border-slate-300">
				<div>
					<h2 class="text-xl font-serif-headline font-bold text-slate-900 tracking-tight"><?php esc_html_e( '최신 공급망 인텔리전스 피드', 'onebethub' ); ?></h2>
					<p class="text-xs text-slate-500 mt-0.5"><?php esc_html_e( '글로벌 플랫폼 코어, API 공급사, 결제 게이트웨이 및 관할 규제 실사', 'onebethub' ); ?></p>
				</div>
			</div>

			<div class="divide-y divide-slate-200">
				<?php if ( $feed_query->have_posts() ) : while ( $feed_query->have_posts() ) : $feed_query->the_post(); ?>
					<article class="py-6 group">
						<div class="flex flex-wrap items-center gap-2 mb-2">
							<?php foreach ( get_the_category() as $cat ) : echo onebethub_category_badge( $cat ); endforeach; ?>
							<time class="text-xs text-slate-400 font-mono" datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>"><?php echo esc_html( get_the_date() ); ?></time>
							<span class="text-xs text-slate-300">·</span>
							<span class="text-xs text-slate-500"><?php the_author(); ?></span>
						</div>
						<h3 class="font-serif-headline text-xl font-bold text-slate-900 group-hover:text-sky-700 transition leading-snug mb-2">
							<a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
						</h3>
						<p class="text-xs text-slate-600 leading-relaxed mb-4"><?php echo esc_html( onebethub_card_excerpt( get_the_ID(), 160 ) ); ?></p>
						<div class="flex items-center justify-between text-xs text-slate-500">
							<span class="font-mono text-[11px]"><?php echo esc_html( sprintf( __( '읽는 시간 약 %d분', 'onebethub' ), onebethub_estimated_read_minutes() ) ); ?></span>
							<a class="text-slate-800 font-semibold group-hover:text-sky-700 inline-flex items-center" href="<?php the_permalink(); ?>">
								<?php esc_html_e( '실사 리포트', 'onebethub' ); ?> <span class="ml-1 font-mono">→</span>
							</a>
						</div>
					</article>
				<?php endwhile; else : ?>
					<p class="py-10 text-sm text-slate-500"><?php esc_html_e( '아직 게시된 리포트가 없습니다.', 'onebethub' ); ?></p>
				<?php endif; ?>
			</div>

			<?php if ( $feed_query->max_num_pages > 1 ) : ?>
				<div class="pt-6 border-t border-slate-200 flex items-center justify-center">
					<?php
					echo paginate_links(
						array(
							'total'   => $feed_query->max_num_pages,
							'current' => $feed_paged,
							'mid_size' => 2,
							'prev_text' => '← ' . __( '이전', 'onebethub' ),
							'next_text' => __( '다음', 'onebethub' ) . ' →',
							'type' => 'list',
						)
					);
					?>
				</div>
			<?php endif; ?>
			<?php wp_reset_postdata(); ?>
		</section>

		<!-- Sidebar rail -->
		<aside class="lg:col-span-4 space-y-6">
			<div class="bg-white p-5 rounded border border-slate-200 shadow-2xs">
				<div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
					<h3 class="text-xs font-bold text-slate-900 tracking-wider uppercase font-mono flex items-center">
						<span class="w-2 h-2 bg-sky-600 mr-2 rounded-full"></span><?php esc_html_e( '카테고리별 최신 리포트', 'onebethub' ); ?>
					</h3>
				</div>
				<ol class="divide-y divide-slate-100 text-xs">
					<?php
					$i = 0;
					foreach ( onebethub_primary_categories() as $cat ) :
						$latest = get_posts(
							array(
								'category'       => $cat->term_id,
								'posts_per_page' => 1,
								'post_status'    => 'publish',
							)
						);
						if ( empty( $latest ) ) {
							continue;
						}
						$i++;
						$p      = $latest[0];
						$colors = onebethub_category_colors( $cat->name );
						?>
						<li class="py-3 flex items-start space-x-3">
							<span class="font-mono text-base font-bold text-slate-400 shrink-0 w-4"><?php echo esc_html( str_pad( (string) $i, 2, '0', STR_PAD_LEFT ) ); ?></span>
							<div>
								<a class="font-serif-headline font-semibold text-slate-900 hover:text-sky-700 leading-tight block" href="<?php echo esc_url( get_permalink( $p ) ); ?>">
									<?php echo esc_html( get_the_title( $p ) ); ?>
								</a>
								<div class="mt-1 flex items-center space-x-2 text-[11px] text-slate-500 font-mono">
									<span class="<?php echo esc_attr( $colors['text'] ); ?> font-medium"><?php echo esc_html( $cat->name ); ?></span>
									<span>·</span>
									<span><?php echo esc_html( get_the_date( '', $p ) ); ?></span>
								</div>
							</div>
						</li>
					<?php endforeach; ?>
				</ol>
			</div>

			<div class="bg-slate-900 text-slate-300 p-5 rounded border border-slate-800" id="editorial-charter">
				<div class="flex items-center space-x-2 text-sky-400 mb-2">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
					<span class="text-xs font-bold uppercase tracking-wider font-mono"><?php esc_html_e( 'Editorial Independence', 'onebethub' ); ?></span>
				</div>
				<h4 class="font-serif-headline text-white text-base font-bold mb-2"><?php esc_html_e( '편집권 독립 헌장', 'onebethub' ); ?></h4>
				<p class="text-[11px] text-slate-400 leading-relaxed">
					<?php bloginfo( 'name' ); ?><?php esc_html_e( '는 게이밍 플랫폼 공급업체로부터 광고비를 받고 실사 순위를 조작하지 않습니다. 모든 벤더 평가와 비용 모델은 공개된 계약 구조와 시장 데이터에 기반한 객관적 분석만을 게재합니다.', 'onebethub' ); ?>
				</p>
			</div>

			<div class="bg-white p-5 rounded border border-slate-200 shadow-2xs">
				<div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono mb-1"><?php esc_html_e( 'Executive Briefing', 'onebethub' ); ?></div>
				<h4 class="font-serif-headline text-base font-bold text-slate-900 mb-2"><?php esc_html_e( '매주, 심층 리포트를 수신하세요', 'onebethub' ); ?></h4>
				<p class="text-xs text-slate-600 mb-3 leading-relaxed"><?php esc_html_e( '플랫폼 아키텍트를 위한 공급망 단가 변동 및 인프라 감사 브리핑을 이메일로 전송합니다.', 'onebethub' ); ?></p>
				<form class="space-y-2" action="mailto:<?php echo esc_attr( get_bloginfo( 'admin_email' ) ); ?>" method="post" enctype="text/plain">
					<input class="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:border-slate-500 focus:ring-1 focus:ring-slate-500" placeholder="corporate@company.com" required type="email" name="email" />
					<button class="w-full bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold py-2 rounded transition" type="submit"><?php esc_html_e( '기업용 브리핑 구독', 'onebethub' ); ?></button>
				</form>
			</div>
		</aside>
	</div>
</div>

<?php get_footer(); ?>
