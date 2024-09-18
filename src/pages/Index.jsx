import RaiseCalculator from '../components/RaiseCalculator';

const Index = () => {
  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-8">
          <h1 className="text-3xl font-bold mb-6 text-center text-blue-600">プロポーカー レイズ計算トレーナー</h1>
          <p className="text-gray-600 mb-6 text-center">
            このアプリケーションは、プロポーカープレイヤーがレイズ計算スキルを向上させるためのトレーニングツールです。
            実際のゲーム状況に基づいて、適切なレイズ額を素早く計算する練習ができます。
          </p>
          <RaiseCalculator />
        </div>
      </div>
    </div>
  );
};

export default Index;
